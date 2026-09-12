package com.taskslist.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.taskslist.user.User;
import com.taskslist.user.UserRepository;
import jakarta.servlet.http.Cookie;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.junit.jupiter.api.extension.ExtendWith;

@SpringBootTest
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
class AuthIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwordEncoder;

    @BeforeEach
    void clearUsers() {
        users.deleteAll();
    }

    @Test
    void registrationRejectsEachBlankRequiredFieldWithFieldErrors() throws Exception {
        Csrf csrf = csrf();

        mvc.perform(post("/api/auth/signup")
                .cookie(csrf.sessionCookie())
                .header(csrf.headerName(), csrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"displayName":" ","email":"  ","password":" "}
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors", hasKey("displayName")))
            .andExpect(jsonPath("$.errors", hasKey("email")))
            .andExpect(jsonPath("$.errors", hasKey("password")));
    }

    @Test
    void registrationRejectsOversizedIdentityFields() throws Exception {
        Csrf csrf = csrf();
        String displayName = "n".repeat(101);
        String email = "e".repeat(255);
        String password = "p".repeat(1025);

        mvc.perform(post("/api/auth/signup")
                .cookie(csrf.sessionCookie())
                .header(csrf.headerName(), csrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"displayName":"%s","email":"%s","password":"%s"}
                    """.formatted(displayName, email, password)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors", hasKey("displayName")))
            .andExpect(jsonPath("$.errors", hasKey("email")))
            .andExpect(jsonPath("$.errors", hasKey("password")));
    }

    @Test
    void registrationEnforcesTheBcryptUtf8ByteBoundary() throws Exception {
        String ascii72Bytes = "a".repeat(72);
        String ascii73Bytes = "a".repeat(73);
        String multibyte72Bytes = "é".repeat(36);
        String multibyte73Bytes = multibyte72Bytes + "a";

        signup("ASCII boundary", "ascii@example.com", ascii72Bytes);
        signup("Multibyte boundary", "multibyte@example.com", multibyte72Bytes);
        registrationPasswordError("ascii-over@example.com", ascii73Bytes);
        registrationPasswordError("multibyte-over@example.com", multibyte73Bytes);

        assertThat(users.count()).isEqualTo(2);
    }

    @Test
    void registrationNormalizesEmailAndRejectsCaseInsensitiveDuplicates() throws Exception {
        signup("Ada", "  Ada@Example.COM ", "correct horse battery staple");
        Csrf csrf = csrf();

        mvc.perform(post("/api/auth/signup")
                .cookie(csrf.sessionCookie())
                .header(csrf.headerName(), csrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"displayName":"Other Ada","email":"ada@example.com","password":"another password"}
                    """))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error", is("Unable to create account")));

        assertThat(users.count()).isEqualTo(1);
        assertThat(users.findByNormalizedEmail("ada@example.com")).isPresent();
    }

    @Test
    void registrationStoresOnlyAnAdaptivePasswordHash() throws Exception {
        signup("Ada", "ada@example.com", "correct horse battery staple");

        User saved = users.findByNormalizedEmail("ada@example.com").orElseThrow();
        assertThat(saved.getPasswordHash())
            .isNotEqualTo("correct horse battery staple")
            .startsWith("{bcrypt}");
        assertThat(passwordEncoder.matches("correct horse battery staple", saved.getPasswordHash())).isTrue();
    }

    @Test
    void registrationDoesNotAuthenticateTheAnonymousSession() throws Exception {
        Csrf csrf = csrf();
        mvc.perform(post("/api/auth/signup")
                .cookie(csrf.sessionCookie())
                .header(csrf.headerName(), csrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"displayName":"Ada","email":"ada@example.com","password":"correct horse battery staple"}
                    """))
            .andExpect(status().isCreated());

        mvc.perform(get("/api/auth/me").cookie(csrf.sessionCookie()))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void invalidCredentialsAreNotWrittenToApplicationLogs(CapturedOutput output) throws Exception {
        loginExpectingFailure("private-person@example.com", "do-not-log-secret");

        assertThat(output).doesNotContain("private-person@example.com", "do-not-log-secret");
    }

    @Test
    void loginUsesTheSameGenericErrorForUnknownEmailAndWrongPassword() throws Exception {
        signup("Ada", "ada@example.com", "correct horse battery staple");

        String unknown = loginError("unknown@example.com", "wrong");
        String wrongPassword = loginError("ada@example.com", "wrong");

        assertThat(unknown).isEqualTo("Invalid credentials");
        assertThat(wrongPassword).isEqualTo(unknown);
    }

    @Test
    void loginEnforcesTheSameBcryptUtf8ByteBoundary() throws Exception {
        String ascii72Bytes = "a".repeat(72);
        String ascii73Bytes = "a".repeat(73);
        String multibyte72Bytes = "é".repeat(36);
        String multibyte73Bytes = multibyte72Bytes + "a";
        signup("ASCII boundary", "ascii@example.com", ascii72Bytes);
        signup("Multibyte boundary", "multibyte@example.com", multibyte72Bytes);

        login("ascii@example.com", ascii72Bytes);
        login("multibyte@example.com", multibyte72Bytes);
        loginPasswordError("ascii@example.com", ascii73Bytes);
        loginPasswordError("multibyte@example.com", multibyte73Bytes);
    }

    @Test
    void validLoginExposesOnlyTheCurrentUsersRequiredIdentity() throws Exception {
        signup("Ada Lovelace", " ADA@example.com ", "correct horse battery staple");
        MvcResult login = login("ada@example.com", "correct horse battery staple");

        mvc.perform(get("/api/auth/me").cookie(requireCookie(login, "SESSION")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.displayName", is("Ada Lovelace")))
            .andExpect(jsonPath("$.email", is("ada@example.com")))
            .andExpect(jsonPath("$.password").doesNotExist())
            .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void flywayStartsWithAnEmptyUserStore() {
        assertThat(users.count()).isZero();
    }

    private MvcResult signup(String displayName, String email, String password) throws Exception {
        Csrf csrf = csrf();
        return mvc.perform(post("/api/auth/signup")
                .cookie(csrf.sessionCookie())
                .header(csrf.headerName(), csrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"displayName":"%s","email":"%s","password":"%s"}
                    """.formatted(displayName, email, password)))
            .andExpect(status().isCreated())
            .andReturn();
    }

    private MvcResult login(String email, String password) throws Exception {
        Csrf csrf = csrf();
        return mvc.perform(post("/api/auth/login")
                .cookie(csrf.sessionCookie())
                .header(csrf.headerName(), csrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"email":"%s","password":"%s"}
                    """.formatted(email, password)))
            .andExpect(status().isOk())
            .andReturn();
    }

    private void registrationPasswordError(String email, String password) throws Exception {
        Csrf csrf = csrf();
        mvc.perform(post("/api/auth/signup")
                .cookie(csrf.sessionCookie())
                .header(csrf.headerName(), csrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"displayName":"Boundary user","email":"%s","password":"%s"}
                    """.formatted(email, password)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors.password", is("Invalid value")))
            .andExpect(jsonPath("$.error").doesNotExist())
            .andExpect(jsonPath("$.trace").doesNotExist());
    }

    private void loginPasswordError(String email, String password) throws Exception {
        Csrf csrf = csrf();
        mvc.perform(post("/api/auth/login")
                .cookie(csrf.sessionCookie())
                .header(csrf.headerName(), csrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"email":"%s","password":"%s"}
                    """.formatted(email, password)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errors.password", is("Invalid value")))
            .andExpect(jsonPath("$.error").doesNotExist())
            .andExpect(jsonPath("$.trace").doesNotExist());
    }

    private String loginError(String email, String password) throws Exception {
        MvcResult result = loginExpectingFailure(email, password);
        return JsonPath.read(result.getResponse().getContentAsString(), "$.error");
    }

    private MvcResult loginExpectingFailure(String email, String password) throws Exception {
        Csrf csrf = csrf();
        return mvc.perform(post("/api/auth/login")
                .cookie(csrf.sessionCookie())
                .header(csrf.headerName(), csrf.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"email":"%s","password":"%s"}
                    """.formatted(email, password)))
            .andExpect(status().isUnauthorized())
            .andReturn();
    }

    private Csrf csrf() throws Exception {
        MvcResult result = mvc.perform(get("/api/auth/csrf"))
            .andExpect(status().isOk())
            .andReturn();
        Map<String, String> body = JsonPath.read(result.getResponse().getContentAsString(), "$");
        return new Csrf(body.get("headerName"), body.get("token"), requireCookie(result, "SESSION"));
    }

    private Cookie requireCookie(MvcResult result, String name) {
        Cookie cookie = result.getResponse().getCookie(name);
        assertThat(cookie).as("response cookie %s", name).isNotNull();
        return cookie;
    }

    private record Csrf(String headerName, String token, Cookie sessionCookie) {}
}
