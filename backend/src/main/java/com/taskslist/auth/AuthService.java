package com.taskslist.auth;

import com.taskslist.user.User;
import com.taskslist.user.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final Clock clock;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, Clock clock) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.clock = clock;
    }

    @Transactional
    public void register(String displayName, String email, String password) {
        String normalizedEmail = normalizeEmail(email);
        if (users.existsByNormalizedEmail(normalizedEmail)) {
            throw new AccountConflictException();
        }

        User user = new User(
            displayName.trim(),
            normalizedEmail,
            passwordEncoder.encode(password),
            Instant.now(clock)
        );
        try {
            users.saveAndFlush(user);
        } catch (DataIntegrityViolationException conflict) {
            throw new AccountConflictException();
        }
    }

    @Transactional(readOnly = true)
    public User currentUser(String normalizedEmail) {
        return users.findByNormalizedEmail(normalizedEmail)
            .orElseThrow(() -> new IllegalStateException("Authenticated account is unavailable"));
    }

    public static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    static final class AccountConflictException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }
}
