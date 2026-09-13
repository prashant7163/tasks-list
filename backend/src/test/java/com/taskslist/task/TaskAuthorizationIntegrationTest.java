package com.taskslist.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class TaskAuthorizationIntegrationTest {

    private static final AtomicInteger USER_SEQUENCE = new AtomicInteger(10_000);

    @Autowired MockMvc mvc;

    @Test
    void listsAndCountsNeverExposeAnotherOwnersActiveOrCompletedTasks() throws Exception {
        Session alice = session("Alice");
        Session bob = session("Bob");
        long active = create(alice, "Alice active");
        long completed = create(alice, "Alice completed");
        mutate(alice, post("/api/tasks/{id}/complete", completed)).andExpect(status().isOk());

        mvc.perform(get("/api/tasks").queryParam("status", "ACTIVE").cookie(bob.cookie()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.tasks", empty())).andExpect(jsonPath("$.count", is(0)));
        mvc.perform(get("/api/tasks").queryParam("status", "COMPLETED").cookie(bob.cookie()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.tasks", empty())).andExpect(jsonPath("$.count", is(0)));
        mvc.perform(get("/api/tasks/counts").cookie(bob.cookie()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.active", is(0))).andExpect(jsonPath("$.completed", is(0)));

        assertThat(active).isPositive();
    }

    @Test
    void everyForeignMutationMatchesTheAbsentTaskNotFoundResponseAndChangesNothing() throws Exception {
        Session alice = session("Alice mutations");
        Session bob = session("Bob mutations");
        long active = create(alice, "Protected active");
        long completed = create(alice, "Protected completed");
        mutate(alice, post("/api/tasks/{id}/complete", completed)).andExpect(status().isOk());
        long absent = Math.max(active, completed) + 1_000_000;

        assertEquivalentNotFound(bob, put("/api/tasks/{id}", active)
            .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Attack\",\"description\":\"Attack\"}"), absent);
        assertEquivalentNotFound(bob, delete("/api/tasks/{id}", active), absent);
        assertEquivalentNotFound(bob, post("/api/tasks/{id}/complete", active), absent);
        assertEquivalentNotFound(bob, post("/api/tasks/{id}/reactivate", completed), absent);

        mvc.perform(get("/api/tasks").queryParam("status", "ACTIVE").cookie(alice.cookie()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.tasks[0].title", is("Protected active")));
        mvc.perform(get("/api/tasks").queryParam("status", "COMPLETED").cookie(alice.cookie()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.tasks[0].title", is("Protected completed")));
    }

    @Test
    void taskReadsRequireAuthenticationAndMutationsRequireCsrf() throws Exception {
        mvc.perform(get("/api/tasks").queryParam("status", "ACTIVE"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error", is("Authentication required")));

        Session owner = session("Security");
        mvc.perform(post("/api/tasks").cookie(owner.cookie())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"No CSRF\",\"description\":\"No CSRF\"}"))
            .andExpect(status().isForbidden());
    }

    private void assertEquivalentNotFound(
        Session actor,
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder foreignRequest,
        long absent
    ) throws Exception {
        MvcResult foreign = mutate(actor, foreignRequest).andExpect(status().isNotFound()).andReturn();
        String path = foreignRequest.buildRequest(null).getRequestURI();
        String absentPath = path.replaceFirst("/\\d+(?=/|$)", "/" + absent);
        var method = foreignRequest.buildRequest(null).getMethod();
        var absentRequest = switch (method) {
            case "PUT" -> put(absentPath).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Attack\",\"description\":\"Attack\"}");
            case "DELETE" -> delete(absentPath);
            default -> post(absentPath);
        };
        MvcResult missing = mutate(actor, absentRequest).andExpect(status().isNotFound()).andReturn();
        assertThat(foreign.getResponse().getContentAsString())
            .isEqualTo(missing.getResponse().getContentAsString())
            .isEqualTo("{\"error\":\"Task not found\"}");
    }

    private long create(Session owner, String title) throws Exception {
        MvcResult result = mutate(owner, post("/api/tasks")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"title":"%s","description":"Description"}
                    """.formatted(title)))
            .andExpect(status().isCreated()).andReturn();
        return ((Number) JsonPath.read(result.getResponse().getContentAsString(), "$.id")).longValue();
    }

    private org.springframework.test.web.servlet.ResultActions mutate(
        Session owner,
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request
    ) throws Exception {
        return mvc.perform(request.cookie(owner.cookie()).header(owner.csrfHeader(), owner.csrfToken()));
    }

    private Session session(String displayName) throws Exception {
        int sequence = USER_SEQUENCE.incrementAndGet();
        String email = "authz-task-user-" + sequence + "@example.com";
        String password = "correct horse battery staple";
        Csrf signupCsrf = csrf(null);
        mvc.perform(post("/api/auth/signup").cookie(signupCsrf.cookie())
                .header(signupCsrf.header(), signupCsrf.token()).contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"displayName":"%s","email":"%s","password":"%s"}
                    """.formatted(displayName, email, password)))
            .andExpect(status().isCreated());
        Csrf loginCsrf = csrf(null);
        MvcResult login = mvc.perform(post("/api/auth/login").cookie(loginCsrf.cookie())
                .header(loginCsrf.header(), loginCsrf.token()).contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"email":"%s","password":"%s"}
                    """.formatted(email, password)))
            .andExpect(status().isOk()).andReturn();
        Cookie cookie = login.getResponse().getCookie("SESSION");
        assertThat(cookie).isNotNull();
        Csrf authenticated = csrf(cookie);
        return new Session(authenticated.cookie(), authenticated.header(), authenticated.token());
    }

    private Csrf csrf(Cookie cookie) throws Exception {
        var request = get("/api/auth/csrf");
        if (cookie != null) request.cookie(cookie);
        MvcResult result = mvc.perform(request).andExpect(status().isOk()).andReturn();
        Map<String, String> body = JsonPath.read(result.getResponse().getContentAsString(), "$");
        Cookie responseCookie = result.getResponse().getCookie("SESSION");
        return new Csrf(responseCookie == null ? cookie : responseCookie, body.get("headerName"), body.get("token"));
    }

    private record Csrf(Cookie cookie, String header, String token) {}
    private record Session(Cookie cookie, String csrfHeader, String csrfToken) {}
}
