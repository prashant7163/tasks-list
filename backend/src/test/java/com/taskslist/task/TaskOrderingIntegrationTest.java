package com.taskslist.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TaskOrderingIntegrationTest.RepositoryFailureConfiguration.class)
class TaskOrderingIntegrationTest {

    private static final AtomicInteger USER_SEQUENCE = new AtomicInteger(20_000);
    private static final AtomicBoolean FAIL_NEXT_REPOSITORY_FLUSH = new AtomicBoolean();

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @AfterEach
    void clearRepositoryFailure() {
        FAIL_NEXT_REPOSITORY_FLUSH.set(false);
    }

    @Test
    void activeListsUseTheDefaultAndEveryAllowedSortWithoutChangingSavedPriority() throws Exception {
        Session owner = session("Active sorting");
        long bravo = create(owner, "bravo");
        long alpha = create(owner, "Alpha");
        long charlie = create(owner, "charlie");
        setCreatedAt(bravo, "2026-01-03T00:00:00Z");
        setCreatedAt(alpha, "2026-01-01T00:00:00Z");
        setCreatedAt(charlie, "2026-01-02T00:00:00Z");

        assertTitles(owner, "ACTIVE", null, null, "bravo", "charlie", "Alpha");
        assertTitles(owner, "ACTIVE", "createdAt", "asc", "Alpha", "charlie", "bravo");
        assertTitles(owner, "ACTIVE", "createdAt", "desc", "bravo", "charlie", "Alpha");
        assertTitles(owner, "ACTIVE", "priority", "asc", "charlie", "Alpha", "bravo");
        assertTitles(owner, "ACTIVE", "priority", "desc", "bravo", "Alpha", "charlie");
        assertTitles(owner, "ACTIVE", "title", "asc", "Alpha", "bravo", "charlie");
        assertTitles(owner, "ACTIVE", "title", "desc", "charlie", "bravo", "Alpha");

        assertThat(priorities(owner)).containsExactly(
            new SavedPriority(charlie, 1), new SavedPriority(alpha, 2), new SavedPriority(bravo, 3));
    }

    @Test
    void completedListsUseTheDefaultAndEveryAllowedSortCaseInsensitively() throws Exception {
        Session owner = session("Completed sorting");
        long bravo = create(owner, "bravo");
        long alpha = create(owner, "Alpha");
        long charlie = create(owner, "charlie");
        mutate(owner, post("/api/tasks/{id}/complete", bravo)).andExpect(status().isOk());
        mutate(owner, post("/api/tasks/{id}/complete", alpha)).andExpect(status().isOk());
        mutate(owner, post("/api/tasks/{id}/complete", charlie)).andExpect(status().isOk());
        setCreatedAt(bravo, "2026-01-03T00:00:00Z");
        setCreatedAt(alpha, "2026-01-01T00:00:00Z");
        setCreatedAt(charlie, "2026-01-02T00:00:00Z");
        setCompletedAt(bravo, "2026-02-01T00:00:00Z");
        setCompletedAt(alpha, "2026-02-03T00:00:00Z");
        setCompletedAt(charlie, "2026-02-02T00:00:00Z");

        assertTitles(owner, "COMPLETED", null, null, "Alpha", "charlie", "bravo");
        assertTitles(owner, "COMPLETED", "completedAt", "asc", "bravo", "charlie", "Alpha");
        assertTitles(owner, "COMPLETED", "completedAt", "desc", "Alpha", "charlie", "bravo");
        assertTitles(owner, "COMPLETED", "createdAt", "asc", "Alpha", "charlie", "bravo");
        assertTitles(owner, "COMPLETED", "createdAt", "desc", "bravo", "charlie", "Alpha");
        assertTitles(owner, "COMPLETED", "title", "asc", "Alpha", "bravo", "charlie");
        assertTitles(owner, "COMPLETED", "title", "desc", "charlie", "bravo", "Alpha");
    }

    @Test
    void unsupportedOrStatusInappropriateSortValuesAreRejected() throws Exception {
        Session owner = session("Invalid sorting");
        create(owner, "Task");

        assertInvalidSort(owner, "ACTIVE", "completedAt", "asc");
        assertInvalidSort(owner, "COMPLETED", "priority", "desc");
        assertInvalidSort(owner, "ACTIVE", "title;delete from task", "asc");
        assertInvalidSort(owner, "ACTIVE", "title", "sideways");
        assertInvalidSort(owner, "ACTIVE", "TITLE", "asc");
    }

    @Test
    void fullOwnerActiveReorderPersistsAcrossReadsAndALaterLogin() throws Exception {
        Session owner = session("Reorder persistence");
        long first = create(owner, "First");
        long second = create(owner, "Second");
        long third = create(owner, "Third");

        reorder(owner, List.of(first, third, second))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.tasks[*].id", contains((int) first, (int) third, (int) second)))
            .andExpect(jsonPath("$.tasks[*].priority", contains(1, 2, 3)));
        assertThat(priorities(owner)).containsExactly(
            new SavedPriority(first, 1), new SavedPriority(third, 2), new SavedPriority(second, 3));

        logout(owner);
        Session laterLogin = login(owner.email(), owner.password());
        assertThat(priorities(laterLogin)).containsExactly(
            new SavedPriority(first, 1), new SavedPriority(third, 2), new SavedPriority(second, 3));
    }

    @Test
    void foreignCompletedMissingDuplicateAndStalePayloadsRollbackWithoutPartialPriorityChanges() throws Exception {
        Session owner = session("Invalid reorder owner");
        Session other = session("Invalid reorder other");
        long first = create(owner, "First");
        long second = create(owner, "Second");
        long third = create(owner, "Third");
        long completed = create(owner, "Completed");
        mutate(owner, post("/api/tasks/{id}/complete", completed)).andExpect(status().isOk());
        long foreign = create(other, "Foreign");
        List<SavedPriority> before = priorities(owner);

        assertRejectedUnchanged(owner, List.of(first, second, foreign), before);
        assertRejectedUnchanged(owner, List.of(first, second, completed), before);
        assertRejectedUnchanged(owner, List.of(first, second, 9_999_999L), before);
        assertRejectedUnchanged(owner, List.of(first, first, third), before);
        assertRejectedUnchanged(owner, List.of(first, second), before);

        long newlyCreated = create(owner, "Created after snapshot");
        List<SavedPriority> afterCreate = priorities(owner);
        assertRejectedUnchanged(owner, List.of(first, second, third), afterCreate);
        assertThat(afterCreate).contains(new SavedPriority(newlyCreated, 1));
    }

    @Test
    void lifecycleMutationsKeepPriorityUniqueAndContiguousAfterAReorder() throws Exception {
        Session owner = session("Reorder lifecycle");
        long first = create(owner, "First");
        long second = create(owner, "Second");
        long third = create(owner, "Third");
        reorder(owner, List.of(first, third, second)).andExpect(status().isOk());

        long newest = create(owner, "Newest");
        assertContiguous(owner, newest, first, third, second);
        mutate(owner, post("/api/tasks/{id}/complete", first)).andExpect(status().isOk());
        assertContiguous(owner, newest, third, second);
        mutate(owner, post("/api/tasks/{id}/reactivate", first)).andExpect(status().isOk());
        assertContiguous(owner, first, newest, third, second);
        mutate(owner, delete("/api/tasks/{id}", third)).andExpect(status().isNoContent());
        assertContiguous(owner, first, newest, second);
    }

    @Test
    void concurrentCreateAndReorderSerializeToOneCompleteContiguousState() throws Exception {
        Session owner = session("Concurrent ordering");
        long first = create(owner, "First");
        long second = create(owner, "Second");
        long third = create(owner, "Third");
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<MvcResult> reorder = executor.submit(() -> {
                start.await();
                return reorder(owner, List.of(first, third, second)).andReturn();
            });
            Future<MvcResult> create = executor.submit(() -> {
                start.await();
                return createResult(owner, "Concurrent create");
            });
            start.countDown();

            assertThat(create.get().getResponse().getStatus()).isEqualTo(201);
            assertThat(reorder.get().getResponse().getStatus()).isIn(200, 409);
        }

        List<SavedPriority> saved = priorities(owner);
        assertThat(saved).hasSize(4);
        assertThat(saved.stream().map(SavedPriority::priority)).containsExactly(1, 2, 3, 4);
        assertThat(saved.stream().map(SavedPriority::id).distinct()).hasSize(4);
    }

    @Test
    void concurrentReordersSerializeWithoutSavingAMixedOrder() throws Exception {
        Session owner = session("Concurrent reorders");
        long first = create(owner, "First");
        long second = create(owner, "Second");
        long third = create(owner, "Third");
        List<Long> orderA = List.of(first, third, second);
        List<Long> orderB = List.of(second, first, third);
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<MvcResult> requestA = executor.submit(() -> {
                start.await();
                return reorder(owner, orderA).andReturn();
            });
            Future<MvcResult> requestB = executor.submit(() -> {
                start.await();
                return reorder(owner, orderB).andReturn();
            });
            start.countDown();

            assertThat(requestA.get().getResponse().getStatus()).isEqualTo(200);
            assertThat(requestB.get().getResponse().getStatus()).isEqualTo(200);
        }

        List<Long> savedIds = priorities(owner).stream().map(SavedPriority::id).toList();
        assertThat(savedIds).isIn(orderA, orderB);
    }

    @Test
    void persistenceFailureDuringReorderRollsBackEveryPriorityChange() throws Exception {
        Session owner = session("Reorder database rollback");
        long first = create(owner, "First");
        long second = create(owner, "Second");
        long third = create(owner, "Third");
        List<SavedPriority> before = priorities(owner);

        FAIL_NEXT_REPOSITORY_FLUSH.set(true);
        reorder(owner, List.of(first, third, second))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.error", is("Request could not be completed")));

        assertThat(priorities(owner)).containsExactlyElementsOf(before);
    }

    private void assertTitles(
        Session owner,
        String taskStatus,
        String sort,
        String direction,
        String... expected
    ) throws Exception {
        var request = get("/api/tasks").queryParam("status", taskStatus).cookie(owner.cookie());
        if (sort != null) request.queryParam("sort", sort);
        if (direction != null) request.queryParam("direction", direction);
        String body = mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<List<String>>read(body, "$.tasks[*].title")).containsExactly(expected);
    }

    private void assertInvalidSort(Session owner, String taskStatus, String sort, String direction) throws Exception {
        mvc.perform(get("/api/tasks")
                .queryParam("status", taskStatus)
                .queryParam("sort", sort)
                .queryParam("direction", direction)
                .cookie(owner.cookie()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error", is("Invalid request")));
    }

    private void assertRejectedUnchanged(
        Session owner,
        List<Long> taskIds,
        List<SavedPriority> expected
    ) throws Exception {
        reorder(owner, taskIds)
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error", is("Task order is stale")));
        assertThat(priorities(owner)).containsExactlyElementsOf(expected);
    }

    private void assertContiguous(Session owner, long... expectedIds) throws Exception {
        List<SavedPriority> expected = new ArrayList<>();
        for (int index = 0; index < expectedIds.length; index++) {
            expected.add(new SavedPriority(expectedIds[index], index + 1));
        }
        assertThat(priorities(owner)).containsExactlyElementsOf(expected);
    }

    private List<SavedPriority> priorities(Session owner) throws Exception {
        String body = mvc.perform(get("/api/tasks")
                .queryParam("status", "ACTIVE")
                .queryParam("sort", "priority")
                .queryParam("direction", "asc")
                .cookie(owner.cookie()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<Map<String, Number>> tasks = JsonPath.read(body, "$.tasks");
        return tasks.stream()
            .map(task -> new SavedPriority(task.get("id").longValue(), task.get("priority").intValue()))
            .toList();
    }

    private org.springframework.test.web.servlet.ResultActions reorder(Session owner, List<Long> taskIds) throws Exception {
        String ids = taskIds.stream().map(String::valueOf).reduce((left, right) -> left + "," + right).orElse("");
        return mutate(owner, post("/api/tasks/reorder")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"taskIds\":[" + ids + "]}"));
    }

    private long create(Session owner, String title) throws Exception {
        return ((Number) JsonPath.read(createResult(owner, title).getResponse().getContentAsString(), "$.id"))
            .longValue();
    }

    private MvcResult createResult(Session owner, String title) throws Exception {
        return mutate(owner, post("/api/tasks")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"" + title + "\",\"description\":\"Description\"}"))
            .andExpect(status().isCreated()).andReturn();
    }

    private org.springframework.test.web.servlet.ResultActions mutate(
        Session owner,
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request
    ) throws Exception {
        return mvc.perform(request.cookie(owner.cookie()).header(owner.csrfHeader(), owner.csrfToken()));
    }

    private void setCreatedAt(long id, String instant) {
        jdbc.update("update task set created_at = ? where id = ?", Instant.parse(instant), id);
    }

    private void setCompletedAt(long id, String instant) {
        jdbc.update("update task set completed_at = ? where id = ?", Instant.parse(instant), id);
    }

    private Session session(String displayName) throws Exception {
        int sequence = USER_SEQUENCE.incrementAndGet();
        String email = "ordering-user-" + sequence + "@example.com";
        String password = "correct horse battery staple";
        Csrf signupCsrf = csrf(null);
        mvc.perform(post("/api/auth/signup").cookie(signupCsrf.cookie())
                .header(signupCsrf.header(), signupCsrf.token()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"displayName\":\"" + displayName + "\",\"email\":\"" + email
                    + "\",\"password\":\"" + password + "\"}"))
            .andExpect(status().isCreated());
        return login(email, password);
    }

    private Session login(String email, String password) throws Exception {
        Csrf loginCsrf = csrf(null);
        MvcResult login = mvc.perform(post("/api/auth/login").cookie(loginCsrf.cookie())
                .header(loginCsrf.header(), loginCsrf.token()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
            .andExpect(status().isOk()).andReturn();
        Cookie cookie = login.getResponse().getCookie("SESSION");
        assertThat(cookie).isNotNull();
        Csrf authenticated = csrf(cookie);
        return new Session(authenticated.cookie(), authenticated.header(), authenticated.token(), email, password);
    }

    private void logout(Session owner) throws Exception {
        mutate(owner, post("/api/auth/logout")).andExpect(status().isNoContent());
    }

    private Csrf csrf(Cookie cookie) throws Exception {
        var request = get("/api/auth/csrf");
        if (cookie != null) request.cookie(cookie);
        MvcResult result = mvc.perform(request).andExpect(status().isOk()).andReturn();
        Map<String, String> body = JsonPath.read(result.getResponse().getContentAsString(), "$");
        Cookie responseCookie = result.getResponse().getCookie("SESSION");
        return new Csrf(responseCookie == null ? cookie : responseCookie, body.get("headerName"), body.get("token"));
    }

    private record SavedPriority(long id, int priority) {}
    private record Csrf(Cookie cookie, String header, String token) {}
    private record Session(Cookie cookie, String csrfHeader, String csrfToken, String email, String password) {}

    @TestConfiguration(proxyBeanMethods = false)
    static class RepositoryFailureConfiguration {

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
                            if (method.getName().equals("flush")
                                && FAIL_NEXT_REPOSITORY_FLUSH.compareAndSet(true, false)) {
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
}
