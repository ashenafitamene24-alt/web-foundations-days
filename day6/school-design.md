# School Database Design & Architecture

This document outlines the database design, entity relationships, indexing strategy, and technology rationale for the school database system implemented in `school.sql`.

---

## 1. Table Explanations

- **`students`**: Represents the individual learners enrolled in the school. It stores primary identity and contact details: `id` (surrogate primary key), `name` (full legal name, required), and `email` (unique electronic contact address, required).
- **`courses`**: Represents the academic catalog offerings provided by the educational institution. It stores course metadata: `id` (surrogate primary key), `code` (e.g., `CS101`, unique curriculum identifier), and `title` (descriptive name of the course, required).
- **`enrolments`**: Serves as the associative entity (join table) capturing the event of a student enrolling into a specific course. It connects records via foreign keys (`student_id` referencing `students.id` and `course_id` referencing `courses.id`) and holds relationship-specific attributes such as `grade`. It enforces business integrity with a composite unique constraint `UNIQUE (student_id, course_id)` so no student can be enrolled into the same course more than once.

---

## 2. Entity Relationships & The Role of the Join Table

### Many-to-Many Conceptual Relationship
In a school domain, the conceptual relationship between **students** and **courses** is **many-to-many (M:N)**:
- A single student can enroll in multiple courses simultaneously.
- A single course can be taken by multiple students simultaneously.

### Two One-to-Many Physical Relationships
Relational databases cannot model a many-to-many relationship directly with a single foreign key without either:
1. Storing multi-valued comma-separated lists of course IDs in the students table (which violates First Normal Form, prevents indexing, and complicates querying).
2. Duplicating entire student rows for each course taken (which causes data redundancy and severe update/deletion anomalies).

To resolve this, the **`enrolments` join table** acts as a bridge, decomposing the M:N relationship into two distinct **one-to-many (1:N)** relationships:
- **`students` &rarr; `enrolments` (1:N)**: One student row has zero, one, or many associated enrolment rows.
- **`courses` &rarr; `enrolments` (1:N)**: One course row has zero, one, or many associated enrolment rows.

Additionally, the join table provides the only logically sound location to store attributes that belong neither to the student alone nor to the course alone, such as the student's **`grade`**, enrolment timestamp, or completion status.

---

## 3. Recommended Index and Rationale

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

### Rationale
In SQLite, primary keys automatically receive a B-tree index, but foreign key columns do not. In a growing school management system, queries frequently aggregate or join by course (such as calculating enrollment numbers per course or listing all students rostered in a course: `JOIN enrolments ON courses.id = enrolments.course_id`). 

Without an index on `enrolments.course_id`, every join or filter on `course_id` requires a full table scan of the entire `enrolments` table ($O(N)$ complexity). Adding `idx_enrolments_course_id` replaces the sequential table scan with an index search ($O(\log N)$ complexity), drastically accelerating reporting queries and join performance as the enrolment history scales to tens of thousands of records. *(Note: While `student_id` is the leading column of the composite `UNIQUE (student_id, course_id)` index, `course_id` is the second column and cannot be used alone for efficient range or equality lookups on `course_id` without its own index).*

---

## 4. SQL vs. NoSQL Architecture Decision

For this school management system, **SQL (a relational database management system such as PostgreSQL or SQLite)** is definitively the superior architectural choice over NoSQL. Academic student and course management is inherently relational, structured, and demands strict ACID transactional compliance. A relational database allows declarative schema definitions, enforced referential integrity through foreign keys with cascading updates/deletes, and prevents critical business logic errors—such as duplicate enrollments (`UNIQUE(student_id, course_id)`) or dangling grade records—directly at the engine level. In contrast, a NoSQL document store (such as MongoDB) would force an awkward compromise between embedding (which creates massive data duplication and severe update anomalies whenever a student's email or course title changes) or referencing (which lacks native declarative joins, schema enforcement, and cross-document relational integrity). The normalized schema, transactional consistency, and rich multi-table query capabilities of SQL align perfectly with the operational requirements of an educational institution.
