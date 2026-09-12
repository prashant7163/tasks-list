package com.taskslist.task;

import com.taskslist.auth.AuthService;
import com.taskslist.task.TaskDtos.TaskCountsResponse;
import com.taskslist.task.TaskDtos.TaskListResponse;
import com.taskslist.task.TaskDtos.TaskResponse;
import com.taskslist.user.User;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TaskService {

    private final TaskRepository tasks;
    private final AuthService authService;
    private final Clock clock;

    public TaskService(TaskRepository tasks, AuthService authService, Clock clock) {
        this.tasks = tasks;
        this.authService = authService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public TaskListResponse list(Authentication authentication, TaskStatus status) {
        User owner = owner(authentication);
        List<Task> ownedTasks = status == TaskStatus.ACTIVE
            ? tasks.findByOwnerIdAndStatusOrderByPriorityAsc(owner.getId(), status)
            : tasks.findByOwnerIdAndStatusOrderByCompletedAtDesc(owner.getId(), status);
        return new TaskListResponse(ownedTasks.stream().map(TaskResponse::from).toList(), ownedTasks.size());
    }

    @Transactional(readOnly = true)
    public TaskCountsResponse counts(Authentication authentication) {
        User owner = owner(authentication);
        return new TaskCountsResponse(
            tasks.countByOwnerIdAndStatus(owner.getId(), TaskStatus.ACTIVE),
            tasks.countByOwnerIdAndStatus(owner.getId(), TaskStatus.COMPLETED)
        );
    }

    @Transactional
    public TaskResponse create(Authentication authentication, String title, String description) {
        User owner = owner(authentication);
        lock(owner);
        activeTasks(owner).forEach(task -> task.setPriority(task.getPriority() + 1));
        Task task = new Task(owner, normalized(title), normalized(description), Instant.now(clock));
        return TaskResponse.from(tasks.save(task));
    }

    @Transactional
    public TaskResponse edit(Authentication authentication, long id, String title, String description) {
        User owner = owner(authentication);
        lock(owner);
        Task task = ownedTask(owner, id);
        requireStatus(task, TaskStatus.ACTIVE);
        task.edit(normalized(title), normalized(description));
        return TaskResponse.from(task);
    }

    @Transactional
    public void delete(Authentication authentication, long id) {
        User owner = owner(authentication);
        lock(owner);
        Task task = ownedTask(owner, id);
        requireStatus(task, TaskStatus.ACTIVE);
        int removedPriority = task.getPriority();
        tasks.delete(task);
        activeTasks(owner).stream()
            .filter(active -> !active.getId().equals(id) && active.getPriority() > removedPriority)
            .forEach(active -> active.setPriority(active.getPriority() - 1));
    }

    @Transactional
    public TaskResponse complete(Authentication authentication, long id) {
        User owner = owner(authentication);
        lock(owner);
        Task task = ownedTask(owner, id);
        requireStatus(task, TaskStatus.ACTIVE);
        int removedPriority = task.getPriority();
        task.complete(Instant.now(clock));
        activeTasks(owner).stream()
            .filter(active -> active.getPriority() > removedPriority)
            .forEach(active -> active.setPriority(active.getPriority() - 1));
        return TaskResponse.from(task);
    }

    @Transactional
    public TaskResponse reactivate(Authentication authentication, long id) {
        User owner = owner(authentication);
        lock(owner);
        Task task = ownedTask(owner, id);
        requireStatus(task, TaskStatus.COMPLETED);
        activeTasks(owner).forEach(active -> active.setPriority(active.getPriority() + 1));
        task.reactivate();
        return TaskResponse.from(task);
    }

    private User owner(Authentication authentication) {
        return authService.currentUser(authentication.getName());
    }

    private void lock(User owner) {
        tasks.lockOwner(owner.getId());
    }

    private List<Task> activeTasks(User owner) {
        return tasks.findByOwnerIdAndStatusOrderByPriorityAsc(owner.getId(), TaskStatus.ACTIVE);
    }

    private Task ownedTask(User owner, long id) {
        return tasks.findByIdAndOwnerId(id, owner.getId()).orElseThrow(TaskNotFoundException::new);
    }

    private void requireStatus(Task task, TaskStatus expected) {
        if (task.getStatus() != expected) {
            throw new InvalidTaskTransitionException();
        }
    }

    private String normalized(String value) {
        return value.trim();
    }

    static final class TaskNotFoundException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }

    static final class InvalidTaskTransitionException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }
}
