package com.taskslist.task;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

public final class TaskDtos {

    private TaskDtos() {}

    public record TaskWriteRequest(
        @NotBlank @Size(max = 120) String title,
        @NotBlank @Size(max = 1000) String description
    ) {}

    public record TaskResponse(
        Long id,
        String title,
        String description,
        TaskStatus status,
        Integer priority,
        Instant createdAt,
        Instant completedAt
    ) {
        static TaskResponse from(Task task) {
            return new TaskResponse(
                task.getId(),
                task.getTitle(),
                task.getDescription(),
                task.getStatus(),
                task.getPriority(),
                task.getCreatedAt(),
                task.getCompletedAt()
            );
        }
    }

    public record TaskListResponse(List<TaskResponse> tasks, long count) {}

    public record TaskCountsResponse(long active, long completed) {}
}
