package com.taskslist.task;

import org.springframework.data.domain.Sort;

record TaskSort(Sort definition) {

    private enum Key {
        CREATED_AT("createdAt"),
        COMPLETED_AT("completedAt"),
        PRIORITY("priority"),
        TITLE("title");

        private final String requestValue;

        Key(String requestValue) {
            this.requestValue = requestValue;
        }

        static Key from(String value) {
            for (Key key : values()) {
                if (key.requestValue.equals(value)) {
                    return key;
                }
            }
            throw new InvalidTaskSortException();
        }
    }

    private enum Direction {
        ASC("asc", Sort.Direction.ASC),
        DESC("desc", Sort.Direction.DESC);

        private final String requestValue;
        private final Sort.Direction springDirection;

        Direction(String requestValue, Sort.Direction springDirection) {
            this.requestValue = requestValue;
            this.springDirection = springDirection;
        }

        static Direction from(String value) {
            for (Direction direction : values()) {
                if (direction.requestValue.equals(value)) {
                    return direction;
                }
            }
            throw new InvalidTaskSortException();
        }
    }

    static TaskSort from(TaskStatus status, String requestedKey, String requestedDirection) {
        if (requestedKey == null && requestedDirection == null) {
            return status == TaskStatus.ACTIVE
                ? typed(Key.CREATED_AT, Direction.DESC)
                : typed(Key.COMPLETED_AT, Direction.DESC);
        }
        if (requestedKey == null || requestedDirection == null) {
            throw new InvalidTaskSortException();
        }

        Key key = Key.from(requestedKey);
        Direction direction = Direction.from(requestedDirection);
        if (status == TaskStatus.ACTIVE && key == Key.COMPLETED_AT) {
            throw new InvalidTaskSortException();
        }
        if (status == TaskStatus.COMPLETED && key == Key.PRIORITY) {
            throw new InvalidTaskSortException();
        }
        return typed(key, direction);
    }

    private static TaskSort typed(Key key, Direction direction) {
        Sort.Order primary = new Sort.Order(direction.springDirection, key.requestValue);
        if (key == Key.TITLE) {
            primary = primary.ignoreCase();
        }
        return new TaskSort(Sort.by(primary, Sort.Order.asc("id")));
    }

    static final class InvalidTaskSortException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }
}
