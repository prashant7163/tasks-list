package com.taskslist.task;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TaskRepository extends JpaRepository<Task, Long> {

    Optional<Task> findByIdAndOwnerId(Long id, Long ownerId);

    List<Task> findByOwnerIdAndStatusOrderByPriorityAsc(Long ownerId, TaskStatus status);

    List<Task> findByOwnerIdAndStatus(Long ownerId, TaskStatus status, Sort sort);

    long countByOwnerIdAndStatus(Long ownerId, TaskStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select user.id from User user where user.id = :ownerId")
    Long lockOwner(@Param("ownerId") Long ownerId);
}
