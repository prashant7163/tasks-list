package com.taskslist.auth;

import com.taskslist.auth.validation.Utf8ByteLength;
import com.taskslist.user.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final AuthService authService;
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContexts;
    private final SessionAuthenticationStrategy sessionAuthenticationStrategy;

    public AuthController(
        AuthService authService,
        AuthenticationManager authenticationManager,
        SecurityContextRepository securityContexts,
        SessionAuthenticationStrategy sessionAuthenticationStrategy
    ) {
        this.authService = authService;
        this.authenticationManager = authenticationManager;
        this.securityContexts = securityContexts;
        this.sessionAuthenticationStrategy = sessionAuthenticationStrategy;
    }

    @GetMapping("/csrf")
    CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getParameterName(), token.getToken());
    }

    @PostMapping("/signup")
    ResponseEntity<Map<String, Boolean>> signup(@Valid @RequestBody SignupRequest request) {
        authService.register(request.displayName(), request.email(), request.password());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("registered", true));
    }

    @PostMapping("/login")
    ResponseEntity<?> login(
        @Valid @RequestBody LoginRequest credentials,
        HttpServletRequest request,
        HttpServletResponse response
    ) {
        try {
            Authentication authentication = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(
                    AuthService.normalizeEmail(credentials.email()),
                    credentials.password()
                )
            );
            sessionAuthenticationStrategy.onAuthentication(authentication, request, response);
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(authentication);
            SecurityContextHolder.setContext(context);
            securityContexts.saveContext(context, request, response);
            return ResponseEntity.ok(Map.of("authenticated", true));
        } catch (AuthenticationException invalidCredentials) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "Invalid credentials"));
        }
    }

    @GetMapping("/me")
    CurrentUserResponse me(Authentication authentication) {
        User user = authService.currentUser(authentication.getName());
        return new CurrentUserResponse(user.getDisplayName(), user.getNormalizedEmail());
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(
        Authentication authentication,
        HttpServletRequest request,
        HttpServletResponse response
    ) {
        new SecurityContextLogoutHandler().logout(request, response, authentication);
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(AuthService.AccountConflictException.class)
    ResponseEntity<Map<String, String>> duplicateAccount() {
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(Map.of("error", "Unable to create account"));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, Object>> validation(MethodArgumentNotValidException exception) {
        Map<String, String> errors = new LinkedHashMap<>();
        for (FieldError fieldError : exception.getBindingResult().getFieldErrors()) {
            errors.putIfAbsent(fieldError.getField(), "Invalid value");
        }
        return ResponseEntity.badRequest().body(Map.of("errors", errors));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> unexpected(Exception exception) {
        log.error("Unexpected request failure ({})", exception.getClass().getSimpleName());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(Map.of("error", "Request could not be completed"));
    }

    record SignupRequest(
        @NotBlank @Size(max = 100) String displayName,
        @NotBlank @Size(max = 254) String email,
        @NotBlank @Utf8ByteLength(max = 72) String password
    ) {
        @Override
        public String toString() {
            return "SignupRequest[displayName=[redacted], email=[redacted], password=[redacted]]";
        }
    }

    record LoginRequest(
        @NotBlank @Size(max = 254) String email,
        @NotBlank @Utf8ByteLength(max = 72) String password
    ) {
        @Override
        public String toString() {
            return "LoginRequest[email=[redacted], password=[redacted]]";
        }
    }

    record CsrfResponse(String headerName, String parameterName, String token) {
        @Override
        public String toString() {
            return "CsrfResponse[headerName=" + headerName + ", parameterName=" + parameterName + ", token=[redacted]]";
        }
    }

    record CurrentUserResponse(String displayName, String email) {
        @Override
        public String toString() {
            return "CurrentUserResponse[displayName=[redacted], email=[redacted]]";
        }
    }
}
