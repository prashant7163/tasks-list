package com.taskslist.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TaskLifecycleIntegrationTest.RepositoryFailureConfiguration.class)
class TaskLifecycleIntegrationTest {

    private static final AtomicInteger USER_SEQUENCE = new AtomicInteger();
    private static final AtomicBoolean FAIL_NEXT_REPOSITORY_SAVE = new AtomicBoolean();

    @Autowired MockMvc mvc;
    @Autowired AdjustableClock taskClock;

    @AfterEach
    void clearRepositoryFailure() {
        FAIL_NEXT_REPOSITORY_SAVE.set(false);
        taskClock.useSystemUtc();
    }

    @Test
    void createValidatesFieldsAndAssignsImmutableBackendLifecycleStateAtHighestPriority() throws Exception {
        Session owner = session("Creator");

        mvc.perform(post("/api/tasks")
                .cookie(owner.cookie())
                .header(owner.csrfHeader(), owner.csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"title":" ","description":"%s"}
                    """.formatted("d".repeat(1001))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors", hasKey("title")))
            .andExpect(jsonPath("$.errors", hasKey("description")));

        long firstId = create(owner, "First", "First description", """
            ,"status":"COMPLETED","priority":99,"createdAt":"2000-01-01T00:00:00Z",
            "completedAt":"2000-01-02T00:00:00Z","ownerId":999
            """);
        Instant beforeSecond = Instant.now();
        MvcResult second = createResult(owner, "Second", "Second description", "");
        Instant afterSecond = Instant.now();

        Instant createdAt = Instant.parse(JsonPath.read(second.getResponse().getContentAsString(), "$.createdAt"));
        assertThat(createdAt).isBetween(beforeSecond.minusSeconds(1), afterSecond.plusSeconds(1));
        mvc.perform(get("/api/tasks").queryParam("status", "ACTIVE").cookie(owner.cookie()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.tasks.length()", is(2)))
            .andExpect(jsonPath("$.tasks[0].title", is("Second")))
            .andExpect(jsonPath("$.tasks[0].status", is("ACTIVE")))
            .andExpect(jsonPath("$.tasks[0].priority", is(1)))
            .andExpect(jsonPath("$.tasks[0].completedAt", nullValue()))
            .andExpect(jsonPath("$.tasks[0].ownerId").doesNotExist())
            .andExpect(jsonPath("$.tasks[1].id", is((int) firstId)))
            .andExpect(jsonPath("$.tasks[1].priority", is(2)))
            .andExpect(jsonPath("$.count", is(2)));

        assertCounts(owner, 2, 0);
    }

    @Test
    void editChangesOnlyContentAndRejectsInvalidBounds() throws Exception {
        Session owner = session("Editor");
        long id = create(owner, "Original", "Original description", "");
        Map<String, Object> before = task(owner, "ACTIVE", id);

        mvc.perform(put("/api/tasks/{id}", id)
                .cookie(owner.cookie())
                .header(owner.csrfHeader(), owner.csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"title":"Updated","description":"Updated description",
                     "status":"COMPLETED","priority":77,"createdAt":"2000-01-01T00:00:00Z"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.title", is("Updated")))
            .andExpect(jsonPath("$.description", is("Updated description")))
            .andExpect(jsonPath("$.status", is("ACTIVE")))
            .andExpect(jsonPath("$.priority", is(1)))
            .andExpect(jsonPath("$.createdAt", is(before.get("createdAt"))));

        mvc.perform(put("/api/tasks/{id}", id)
                .cookie(owner.cookie())
                .header(owner.csrfHeader(), owner.csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"title":"%s","description":" "}
                    """.formatted("t".repeat(121))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors", hasKey("title")))
            .andExpect(jsonPath("$.errors", hasKey("description")));

        assertThat(task(owner, "ACTIVE", id).get("title")).isEqualTo("Updated");
    }

    @Test
    void completeAndReactivateSetUtcLifecycleFieldsAndHighestPriority() throws Exception {
        Session owner = session("Transitions");
        long first = create(owner, "First", "Description", "");
        long second = create(owner, "Second", "Description", "");
        String originalCreatedAt = (String) task(owner, "ACTIVE", first).get("createdAt");
        Instant beforeCompletion = Instant.now();

        MvcResult completed = mutate(owner, post("/api/tasks/{id}/complete", first), status().isOk()).andReturn();
        Instant completedAt = Instant.parse(JsonPath.read(completed.getResponse().getContentAsString(), "$.completedAt"));
        assertThat(completedAt).isAfterOrEqualTo(beforeCompletion.minusSeconds(1));
        assertThat(completedAt.toString()).endsWith("Z");
        mvc.perform(get("/api/tasks").queryParam("status", "COMPLETED").cookie(owner.cookie()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.tasks[0].id", is((int) first)))
            .andExpect(jsonPath("$.tasks[0].status", is("COMPLETED")))
            .andExpect(jsonPath("$.tasks[0].priority", nullValue()))
            .andExpect(jsonPath("$.tasks[0].createdAt", is(originalCreatedAt)))
            .andExpect(jsonPath("$.count", is(1)));
        assertThat(task(owner, "ACTIVE", second).get("priority")).isEqualTo(1);
        assertCounts(owner, 1, 1);

        mutate(owner, post("/api/tasks/{id}/reactivate", first), status().isOk());
        mvc.perform(get("/api/tasks").queryParam("status", "ACTIVE").cookie(owner.cookie()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.tasks[0].id", is((int) first)))
            .andExpect(jsonPath("$.tasks[0].priority", is(1)))
            .andExpect(jsonPath("$.tasks[0].completedAt", nullValue()))
            .andExpect(jsonPath("$.tasks[0].createdAt", is(originalCreatedAt)))
            .andExpect(jsonPath("$.tasks[1].priority", is(2)));
        assertCounts(owner, 2, 0);
    }

    @Test
    void permanentDeleteClosesPriorityGap() throws Exception {
        Session owner = session("Deleter");
        long lowest = create(owner, "Lowest", "Description", "");
        long middle = create(owner, "Middle", "Description", "");
        long highest = create(owner, "Highest", "Description", "");

        mutate(owner, delete("/api/tasks/{id}", middle), status().isNoContent());

        mvc.perform(get("/api/tasks").queryParam("status", "ACTIVE").cookie(owner.cookie()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.tasks[0].id", is((int) highest)))
            .andExpect(jsonPath("$.tasks[0].priority", is(1)))
            .andExpect(jsonPath("$.tasks[1].id", is((int) lowest)))
            .andExpect(jsonPath("$.tasks[1].priority", is(2)))
            .andExpect(jsonPath("$.count", is(2)));
    }

    @Test
    void invalidTransitionsAndCompletedMutationsAreRejectedWithoutPartialState() throws Exception {
        Session owner = session("Rollback");
        long id = create(owner, "Stable", "Stable description", "");

        mutate(owner, post("/api/tasks/{id}/reactivate", id), status().isConflict())
            .andExpect(jsonPath("$.error", is("Invalid task transition")));
        mutate(owner, post("/api/tasks/{id}/complete", id), status().isOk());
        Map<String, Object> completed = task(owner, "COMPLETED", id);

        mutate(owner, post("/api/tasks/{id}/complete", id), status().isConflict())
            .andExpect(jsonPath("$.error", is("Invalid task transition")));
        mutate(owner, put("/api/tasks/{id}", id)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Changed\",\"description\":\"Changed\"}"), status().isConflict());
        mutate(owner, delete("/api/tasks/{id}", id), status().isConflict());

        Map<String, Object> after = task(owner, "COMPLETED", id);
        assertThat(after.get("title")).isEqualTo("Stable");
        assertThat(after.get("completedAt")).isEqualTo(completed.get("completedAt"));
        assertCounts(owner, 0, 1);
    }

    @Test
    void databaseFailureAfterPriorityShiftReturnsGenericErrorAndRollsBackEveryChange() throws Exception {
        Session owner = session("Database rollback");
        create(owner, "First unchanged", "First description", "");
        create(owner, "Second unchanged", "Second description", "");
        String tasksBefore = listBody(owner, "ACTIVE");
        String countsBefore = countsBody(owner);

        FAIL_NEXT_REPOSITORY_SAVE.set(true);
        try {
            mvc.perform(post("/api/tasks")
                    .cookie(owner.cookie())
                    .header(owner.csrfHeader(), owner.csrfToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""
                        {"title":"Must not persist","description":"Failed create"}
                        """))
                .andExpect(status().isInternalServerError())
                .andExpect(content().string("{\"error\":\"Request could not be completed\"}"))
                .andExpect(jsonPath("$.error", is("Request could not be completed")))
                .andExpect(jsonPath("$.exception").doesNotExist())
                .andExpect(jsonPath("$.trace").doesNotExist());
        } finally {
            FAIL_NEXT_REPOSITORY_SAVE.set(false);
        }

        assertThat(listBody(owner, "ACTIVE")).isEqualTo(tasksBefore).doesNotContain("Must not persist");
        assertThat(countsBody(owner)).isEqualTo(countsBefore);
    }

    @Test
    void backendTimestampsUsePostgresqlMicrosecondPrecisionAndRemainStableAcrossReads() throws Exception {
        taskClock.set(Instant.parse("2026-09-12T19:23:49.500992260Z"));
        Session owner = session("Timestamp precision");

        MvcResult created = createResult(owner, "Precision task", "Timestamp description", "");
        String createdAt = JsonPath.read(created.getResponse().getContentAsString(), "$.createdAt");
        assertThat(createdAt).isEqualTo("2026-09-12T19:23:49.500992Z");
        long id = ((Number) JsonPath.read(created.getResponse().getContentAsString(), "$.id")).longValue();
        assertThat(task(owner, "ACTIVE", id).get("createdAt")).isEqualTo(createdAt);

        taskClock.set(Instant.parse("2026-09-12T19:23:49.962466010Z"));
        MvcResult completed = mutate(owner, post("/api/tasks/{id}/complete", id), status().isOk()).andReturn();
        String completedBody = completed.getResponse().getContentAsString();
        String completedAt = JsonPath.read(completedBody, "$.completedAt");
        assertThat(JsonPath.<String>read(completedBody, "$.createdAt")).isEqualTo(createdAt);
        assertThat(completedAt).isEqualTo("2026-09-12T19:23:49.962466Z");

        Map<String, Object> readCompleted = task(owner, "COMPLETED", id);
        assertThat(readCompleted.get("createdAt")).isEqualTo(createdAt);
        assertThat(readCompleted.get("completedAt")).isEqualTo(completedAt);
    }

    private void assertCounts(Session owner, int active, int completed) throws Exception {
        mvc.perform(get("/api/tasks/counts").cookie(owner.cookie()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.active", is(active)))
            .andExpect(jsonPath("$.completed", is(completed)));
    }

    private String listBody(Session owner, String taskStatus) throws Exception {
        return mvc.perform(get("/api/tasks").queryParam("status", taskStatus).cookie(owner.cookie()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
    }

    private String countsBody(Session owner) throws Exception {
        return mvc.perform(get("/api/tasks/counts").cookie(owner.cookie()))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
            .andReturn().getResponse().getContentAsString();
    }

    private Map<String, Object> task(Session owner, String status, long id) throws Exception {
        String body = mvc.perform(get("/api/tasks").queryParam("status", status).cookie(owner.cookie()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        for (Map<String, Object> task : JsonPath.<java.util.List<Map<String, Object>>>read(body, "$.tasks")) {
            if (((Number) task.get("id")).longValue() == id) {
                return task;
            }
        }
        throw new AssertionError("Task not found in response: " + id);
    }

    private long create(Session owner, String title, String description, String extraFields) throws Exception {
        return ((Number) JsonPath.read(createResult(owner, title, description, extraFields)
            .getResponse().getContentAsString(), "$.id")).longValue();
    }

    private MvcResult createResult(Session owner, String title, String description, String extraFields) throws Exception {
        return mvc.perform(post("/api/tasks")
                .cookie(owner.cookie())
                .header(owner.csrfHeader(), owner.csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"title":"%s","description":"%s"%s}
                    """.formatted(title, description, extraFields)))
            .andExpect(status().isCreated())
            .andReturn();
    }

    private org.springframework.test.web.servlet.ResultActions mutate(
        Session owner,
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
        org.springframework.test.web.servlet.ResultMatcher expectedStatus
    ) throws Exception {
        return mvc.perform(request.cookie(owner.cookie()).header(owner.csrfHeader(), owner.csrfToken()))
            .andExpect(expectedStatus);
    }

    private Session session(String displayName) throws Exception {
        int sequence = USER_SEQUENCE.incrementAndGet();
        String email = "task-user-" + sequence + "@example.com";
        String password = "correct horse battery staple";
        Csrf anonymous = csrf(null);
        mvc.perform(post("/api/auth/signup")
                .cookie(anonymous.cookie())
                .header(anonymous.header(), anonymous.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"displayName":"%s","email":"%s","password":"%s"}
                    """.formatted(displayName, email, password)))
            .andExpect(status().isCreated());

        Csrf loginCsrf = csrf(null);
        MvcResult login = mvc.perform(post("/api/auth/login")
                .cookie(loginCsrf.cookie())
                .header(loginCsrf.header(), loginCsrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"email":"%s","password":"%s"}
                    """.formatted(email, password)))
            .andExpect(status().isOk())
            .andReturn();
        Cookie cookie = login.getResponse().getCookie("SESSION");
        assertThat(cookie).isNotNull();
        Csrf authenticated = csrf(cookie);
        return new Session(authenticated.cookie(), authenticated.header(), authenticated.token());
    }

    private Csrf csrf(Cookie cookie) throws Exception {
        var request = get("/api/auth/csrf");
        if (cookie != null) {
            request.cookie(cookie);
        }
        MvcResult result = mvc.perform(request).andExpect(status().isOk()).andReturn();
        Map<String, String> body = JsonPath.read(result.getResponse().getContentAsString(), "$");
        Cookie responseCookie = result.getResponse().getCookie("SESSION");
        return new Csrf(responseCookie == null ? cookie : responseCookie, body.get("headerName"), body.get("token"));
    }

    private record Csrf(Cookie cookie, String header, String token) {}
    private record Session(Cookie cookie, String csrfHeader, String csrfToken) {}

    @TestConfiguration(proxyBeanMethods = false)
    static class RepositoryFailureConfiguration {

        @Bean
        @Primary
        AdjustableClock adjustableClock() {
            return new AdjustableClock();
        }

        @Bean
        static BeanPostProcessor taskRepositoryFailurePostProcessor() {
            return new BeanPostProcessor() {
                @Override
                public Object postProcessAfterInitialization(Object bean, String beanName) {
                    if (!(bean instanceof TaskRepository)) {
                        return bean;
                    }
                    return Proxy.newProxyInstance(
                        TaskRepository.class.getClassLoader(),
                        new Class<?>[] {TaskRepository.class},
                        (proxy, method, arguments) -> {
                            if (method.getName().equals("save")
                                && FAIL_NEXT_REPOSITORY_SAVE.compareAndSet(true, false)) {
                                throw new DataAccessResourceFailureException("injected task repository failure");
                            }
                            try {
                                return method.invoke(bean, arguments);
                            } catch (InvocationTargetException invocation) {
                                throw invocation.getTargetException();
                            }
                        }
                    );
                }
            };
        }
    }

    static final class AdjustableClock extends Clock {
        private final AtomicReference<Clock> delegate = new AtomicReference<>(Clock.systemUTC());

        void set(Instant instant) {
            delegate.set(Clock.fixed(instant, ZoneOffset.UTC));
        }

        void useSystemUtc() {
            delegate.set(Clock.systemUTC());
        }

        @Override
        public ZoneId getZone() {
            return delegate.get().getZone();
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return delegate.get().withZone(zone);
        }

        @Override
        public Instant instant() {
            return delegate.get().instant();
        }
    }
}
