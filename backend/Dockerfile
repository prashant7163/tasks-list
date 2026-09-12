FROM maven:3.9.11-eclipse-temurin-21-alpine AS build
WORKDIR /workspace
COPY pom.xml ./
RUN mvn --batch-mode dependency:go-offline
COPY src ./src
RUN mvn --batch-mode package -DskipTests

FROM eclipse-temurin:21.0.8_9-jre-alpine-3.22
RUN addgroup -S taskslist && adduser -S taskslist -G taskslist \
    && mkdir -p /app/logs && chown -R taskslist:taskslist /app
WORKDIR /app
COPY --from=build --chown=taskslist:taskslist /workspace/target/tasks-list-backend-0.0.1-SNAPSHOT.jar application.jar
USER taskslist
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/application.jar"]
