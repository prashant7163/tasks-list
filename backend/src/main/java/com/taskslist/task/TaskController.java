package com.taskslist.task;

import com.taskslist.task.TaskDtos.TaskCountsResponse;
import com.taskslist.task.TaskDtos.TaskListResponse;
import com.taskslist.task.TaskDtos.TaskResponse;
import com.taskslist.task.TaskDtos.TaskWriteRequest;
import jakarta.validation.Valid;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private static final Logger log = LoggerFactory.getLogger(TaskController.class);

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @GetMapping
    TaskListResponse list(@RequestParam TaskStatus status, Authentication authentication) {
        return taskService.list(authentication, status);
    }

    @GetMapping("/counts")
    TaskCountsResponse counts(Authentication authentication) {
        return taskService.counts(authentication);
    }

    @PostMapping
    ResponseEntity<TaskResponse> create(
        @Valid @RequestBody TaskWriteRequest request,
        Authentication authentication
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(taskService.create(authentication, request.title(), request.description()));
    }

    @PutMapping("/{id}")
    TaskResponse edit(
        @PathVariable long id,
        @Valid @RequestBody TaskWriteRequest request,
        Authentication authentication
    ) {
        return taskService.edit(authentication, id, request.title(), request.description());
    }

    @DeleteMapping("/{id}")
    ResponseEntity<Void> delete(@PathVariable long id, Authentication authentication) {
        taskService.delete(authentication, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/complete")
    TaskResponse complete(@PathVariable long id, Authentication authentication) {
        return taskService.complete(authentication, id);
    }

    @PostMapping("/{id}/reactivate")
    TaskResponse reactivate(@PathVariable long id, Authentication authentication) {
        return taskService.reactivate(authentication, id);
    }

    @ExceptionHandler(TaskService.TaskNotFoundException.class)
    ResponseEntity<Map<String, String>> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Task not found"));
    }

    @ExceptionHandler(TaskService.InvalidTaskTransitionException.class)
    ResponseEntity<Map<String, String>> invalidTransition() {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "Invalid task transition"));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, Object>> validation(MethodArgumentNotValidException exception) {
        Map<String, String> errors = new LinkedHashMap<>();
        for (FieldError fieldError : exception.getBindingResult().getFieldErrors()) {
            errors.putIfAbsent(fieldError.getField(), "Invalid value");
        }
        return ResponseEntity.badRequest().body(Map.of("errors", errors));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<Map<String, String>> invalidParameter() {
        return ResponseEntity.badRequest().body(Map.of("error", "Invalid request"));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> unexpected(Exception exception) {
        log.error("Unexpected task request failure ({})", exception.getClass().getSimpleName());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(Map.of("error", "Request could not be completed"));
    }
}
