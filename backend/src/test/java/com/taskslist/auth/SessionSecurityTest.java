package com.taskslist.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.time.Duration;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import com.taskslist.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class SessionSecurityTest {

    @Autowired MockMvc mvc;
    @Autowired @SuppressWarnings("rawtypes") SessionRepository sessions;
    @Autowired UserRepository users;

    @BeforeEach
    void clearUsers() {
        users.deleteAll();
    }

    @Test
    void unauthenticatedCurrentUserReturnsAJson401WithoutSensitiveDetail() throws Exception {
        mvc.perform(get("/api/auth/me"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error", is("Authentication required")))
            .andExpect(jsonPath("$.exception").doesNotExist())
            .andExpect(jsonPath("$.trace").doesNotExist());
    }

    @Test
    void everyStateChangingAuthenticationEndpointRejectsMissingCsrf() throws Exception {
        mvc.perform(post("/api/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"displayName":"Ada","email":"ada@example.com","password":"password"}
                    """))
            .andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"email":"ada@example.com","password":"password"}
                    """))
            .andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/logout"))
            .andExpect(status().isForbidden());
    }

    @Test
    void serverSessionCookieIsHttpOnlyAndSameSiteLax() throws Exception {
        MvcResult result = mvc.perform(get("/api/auth/csrf"))
            .andExpect(status().isOk())
            .andReturn();

        assertThat(result.getResponse().getHeader("Set-Cookie"))
            .contains("HttpOnly")
            .contains("SameSite=Lax");
    }

    @Test
    void loginRotatesThePreAuthenticationSessionIdentifier() throws Exception {
        signup();
        Csrf csrf = csrf();
        String anonymousSessionId = csrf.sessionCookie().getValue();

        MvcResult login = login(csrf);

        assertThat(requireCookie(login, "SESSION").getValue()).isNotEqualTo(anonymousSessionId);
    }

    @Test
    void logoutInvalidatesTheServerSessionAndOldCookieCannotReachCurrentUser() throws Exception {
        signup();
        MvcResult login = login(csrf());
        Cookie authenticatedSession = requireCookie(login, "SESSION");
        Csrf logoutCsrf = csrf(authenticatedSession);

        mvc.perform(post("/api/auth/logout")
                .cookie(authenticatedSession)
                .header(logoutCsrf.headerName(), logoutCsrf.token()))
            .andExpect(status().isNoContent());

        mvc.perform(get("/api/auth/me").cookie(authenticatedSession))
            .andExpect(status().isUnauthorized());
        assertThat(findSession(sessionId(authenticatedSession))).isNull();
    }

    @Test
    void expiredSessionCookieCannotReachCurrentUser() throws Exception {
        signup();
        MvcResult login = login(csrf());
        Cookie authenticatedSession = requireCookie(login, "SESSION");
        Session stored = findSession(sessionId(authenticatedSession));
        assertThat(stored).isNotNull();
        stored.setMaxInactiveInterval(Duration.ZERO);
        saveSession(stored);

        mvc.perform(get("/api/auth/me").cookie(authenticatedSession))
            .andExpect(status().isUnauthorized());
    }

    private void signup() throws Exception {
        Csrf csrf = csrf();
        mvc.perform(post("/api/auth/signup")
                .cookie(csrf.sessionCookie())
                .header(csrf.headerName(), csrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"displayName":"Ada","email":"ada@example.com","password":"correct horse battery staple"}
                    """))
            .andExpect(status().isCreated());
    }

    private MvcResult login(Csrf csrf) throws Exception {
        return mvc.perform(post("/api/auth/login")
                .cookie(csrf.sessionCookie())
                .header(csrf.headerName(), csrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"email":"ada@example.com","password":"correct horse battery staple"}
                    """))
            .andExpect(status().isOk())
            .andReturn();
    }

    private Csrf csrf() throws Exception {
        return csrf(null);
    }

    private Csrf csrf(Cookie sessionCookie) throws Exception {
        var request = get("/api/auth/csrf");
        if (sessionCookie != null) {
            request.cookie(sessionCookie);
        }
        MvcResult result = mvc.perform(request)
            .andExpect(status().isOk())
            .andReturn();
        Map<String, String> body = JsonPath.read(result.getResponse().getContentAsString(), "$");
        Cookie responseSession = result.getResponse().getCookie("SESSION");
        return new Csrf(
            body.get("headerName"),
            body.get("token"),
            responseSession == null ? sessionCookie : responseSession
        );
    }

    private Cookie requireCookie(MvcResult result, String name) {
        Cookie cookie = result.getResponse().getCookie(name);
        assertThat(cookie).as("response cookie %s", name).isNotNull();
        return cookie;
    }

    @SuppressWarnings("unchecked")
    private Session findSession(String id) {
        return (Session) sessions.findById(id);
    }

    private String sessionId(Cookie cookie) {
        return new String(Base64.getDecoder().decode(cookie.getValue()), StandardCharsets.UTF_8);
    }

    @SuppressWarnings("unchecked")
    private void saveSession(Session session) {
        sessions.save(session);
    }

    private record Csrf(String headerName, String token, Cookie sessionCookie) {}
}
