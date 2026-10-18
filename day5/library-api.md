# Library Books REST API Design

A RESTful API specification for managing a library's book collection resource.

---

## Endpoints

### 1. List All Books
- **Method**: `GET`
- **Path**: `/api/books`
- **Description**: Retrieves a paginated list of all books available in the library catalog.
- **Request Body**: None
- **Success Status Code**: `200 OK`

---

### 2. Get a Single Book
- **Method**: `GET`
- **Path**: `/api/books/{id}`
- **Description**: Retrieves the complete details of a specific book by its unique identifier.
- **Request Body**: None
- **Success Status Code**: `200 OK`

---

### 3. Create a New Book
- **Method**: `POST`
- **Path**: `/api/books`
- **Description**: Adds a new book entry to the library catalog.
- **Request Body**:
  ```json
  {
    "title": "The Pragmatic Programmer",
    "author": "Andrew Hunt, David Thomas",
    "isbn": "978-0201616224",
    "publishedYear": 1999,
    "genre": "Software Engineering"
  }
  ```
- **Success Status Code**: `201 Created`

---

### 4. Update an Existing Book
- **Method**: `PUT`
- **Path**: `/api/books/{id}`
- **Description**: Updates all attributes of an existing book record identified by its ID.
- **Request Body**:
  ```json
  {
    "title": "The Pragmatic Programmer: 20th Anniversary Edition",
    "author": "David Thomas, Andrew Hunt",
    "isbn": "978-0135957059",
    "publishedYear": 2019,
    "genre": "Software Engineering"
  }
  ```
- **Success Status Code**: `200 OK`

---

### 5. Delete a Book
- **Method**: `DELETE`
- **Path**: `/api/books/{id}`
- **Description**: Permanently removes a book from the library catalog using its ID.
- **Request Body**: None
- **Success Status Code**: `204 No Content`

---

### 6. List Books by Author (Query Parameter)
- **Method**: `GET`
- **Path**: `/api/books?author={authorName}`
- **Description**: Filters and retrieves all books authored by a specified person via query string.
- **Request Body**: None
- **Success Status Code**: `200 OK`

---

## Error Codes

### 400 Bad Request
- **Meaning**: The request was malformed, contains invalid data types, or violates required field constraints.
- **Example Scenario**:
  - A client sends a `POST /api/books` request omitting the mandatory `"title"` field or supplying an invalid year format:
    ```json
    {
      "author": "George Orwell",
      "publishedYear": "not-a-year"
    }
    ```
  - The server responds with `400 Bad Request` and an error message specifying `"title is required and publishedYear must be a 4-digit integer"`.

---

### 404 Not Found
- **Meaning**: The target resource could not be found at the specified URL path.
- **Example Scenario**:
  - A client requests a book using an ID that does not exist in the database, such as `GET /api/books/99999`.
  - The server searches the catalog, finds no matching record, and responds with `404 Not Found` and a message stating `"Book with ID 99999 not found"`.
