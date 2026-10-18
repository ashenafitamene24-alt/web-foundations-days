# TicketHub — High-Concurrency Event Ticketing System Design

This document details the system design, capacity calculations, REST API specifications, relational data model, high-availability architecture, and concurrency control mechanisms for **TicketHub**, an online ticketing platform engineered to survive high-stakes flash ticket sales.

---

## 1. System Requirements

### A. Functional Requirements
1. **Event Discovery**: Users can browse, search, and filter upcoming concerts and live events by artist, venue, city, and date.
2. **Interactive Seat Map**: Users can view real-time seat availability and tier pricing for any event.
3. **Seat Holding (Reservation Lock)**: Users can temporarily hold selected seats for up to **10 minutes** to complete checkout without someone else purchasing them.
4. **Secure Checkout & Payment**: Users complete payment through an integrated payment gateway, converting held seats into confirmed ticket purchases.
5. **Ticket Management**: Users can retrieve purchased tickets, view seat assignments, and access scannable digital barcodes/QR codes for venue entry.

### B. Non-Functional Requirements
1. **Speed (Low Latency)**:
   - Event catalog and seat map lookups must respond in under **100 ms** ($p95$).
   - Seat hold acquisition and checkout transactions must resolve in under **250 ms** ($p99$).
2. **Correctness (Zero Double-Booking)**:
   - Under no circumstances can two distinct users buy or hold the exact same physical seat.
   - Enforce strict ACID transactions with serializable/row-level isolation on seat allocation.
3. **Fairness**:
   - First-In, First-Out (FIFO) access during sudden ticket drops via a **Virtual Waiting Room** to eliminate race-condition exploitation by bots.
   - Enforce strict hold expiration: held seats are released back into the available pool after exactly 10 minutes if unpaid.
4. **Availability & Fault Tolerance**:
   - **99.99% availability** during peak sale windows.
   - Graceful degradation: If payment verification experiences upstream latency, held seats remain protected while the system retries asynchronously.

---

## 2. Capacity Planning & Traffic Estimates

### Baseline Facts
- **Registered User Base**: 2,000,000 users.
- **Normal Day Operations**:
  - 50,000 daily visitors viewing 10 pages each = 500,000 page views/day.
  - 5,000 tickets sold/day.
- **"Big Sale" Flash Sale Operations**:
  - 20,000 total seats available for a stadium concert.
  - 200,000 concurrent buyers attempting to purchase within the first **10 minutes (600 seconds)**.

---

### Quantitative Traffic Analysis & Comparison

#### A. Normal Day Calculations
- **Read Throughput (Page Views)**:
  $$\text{Average Read QPS} = \frac{500,000 \text{ views}}{86,400 \text{ seconds}} \approx \mathbf{5.79 \text{ QPS}}$$
  $$\text{Peak Read QPS (3×)} = 5.79 \times 3 \approx \mathbf{17.36 \text{ QPS}}$$
- **Write Throughput (Ticket Purchases)**:
  $$\text{Average Write QPS} = \frac{5,000 \text{ tickets}}{86,400 \text{ seconds}} \approx \mathbf{0.058 \text{ purchases/sec}}$$
  $$\text{Peak Write QPS (5×)} = 0.058 \times 5 \approx \mathbf{0.29 \text{ purchases/sec}}$$

#### B. "Big Sale" Peak Calculations (10-Minute Window / 600s)
- **Active Concurrent Buyers**: 200,000 users.
- **Seat Hold & Purchase Requests**:
  $$\text{Average Booking Requests/sec} = \frac{200,000 \text{ attempts}}{600 \text{ seconds}} \approx \mathbf{333.33 \text{ requests/sec}}$$
  $$\text{Drop-Second Spike (Opening Rush, 5×)} = 333.33 \times 5 \approx \mathbf{1,666.67 \text{ write requests/sec}}$$
- **Seat Map Views & Status Polling**:
  - Assuming each user refreshes the seat map/event view 10 times during the 10-minute sale:
  $$\text{Total Read Requests} = 200,000 \text{ users} \times 10 \text{ views} = 2,000,000 \text{ reads}$$
  $$\text{Average Flash Read QPS} = \frac{2,000,000}{600 \text{ seconds}} \approx \mathbf{3,333.33 \text{ QPS}}$$
  $$\text{Peak Flash Read QPS (2×)} = 3,333.33 \times 2 \approx \mathbf{6,666.67 \text{ QPS}}$$

#### C. Normal Day vs. Big Sale Comparison

| Metric | Normal Day | Big Sale Peak (10 min) | Scale Multiplier |
| :--- | :--- | :--- | :--- |
| **Active Concurrent Users** | ~2,500 | 200,000 | **80× surge** |
| **Read Queries per Second (QPS)** | ~5.79 QPS | ~3,333 QPS (peak 6,667 QPS) | **575× surge** |
| **Write / Transaction Requests/sec** | ~0.058 writes/sec | ~333 writes/sec (peak 1,667 writes/sec) | **5,740× surge** |
| **Supply vs. Demand Ratio** | Ample inventory | 200,000 buyers for 20,000 seats | **10× Oversubscribed** |

---

## 3. REST API Specification

### 1. List / Search Events
- **Method & Path**: `GET /api/v1/events`
- **Description**: Returns paginated event listings with venue, dates, and starting prices.
- **Query Parameters**: `?search=Taylor&city=London&page=1&limit=20`
- **Success Status**: `200 OK`

---

### 2. View Real-Time Seat Availability Map
- **Method & Path**: `GET /api/v1/events/{eventId}/seats`
- **Description**: Retrieves all seats for an event along with their status (`available`, `held`, `booked`) and tier pricing.
- **Success Status**: `200 OK`
- **Response Example**:
  ```json
  {
    "eventId": "evt_9812",
    "totalSeats": 20000,
    "availableSeats": 4210,
    "seats": [
      { "id": "seat_A101", "section": "Floor", "row": "A", "number": 101, "price": 150.00, "status": "available" },
      { "id": "seat_A102", "section": "Floor", "row": "A", "number": 102, "price": 150.00, "status": "held" }
    ]
  }
  ```

---

### 3. Hold Selected Seats (10-Minute Lock)
- **Method & Path**: `POST /api/v1/seats/hold`
- **Description**: Temporarily reserves one or more seats for 10 minutes to allow the authenticated user to complete payment.
- **Request Body**:
  ```json
  {
    "eventId": "evt_9812",
    "seatIds": ["seat_A101"]
  }
  ```
- **Success Status**: `201 Created`
- **Response Example**:
  ```json
  {
    "holdId": "hld_48102a",
    "seatIds": ["seat_A101"],
    "holdExpiresAt": "2026-10-18T11:10:00Z",
    "expiresInSeconds": 600,
    "message": "Seats held for 10 minutes. Please complete payment."
  }
  ```

---

### 4. Pay & Confirm Order Checkout
- **Method & Path**: `POST /api/v1/orders/checkout`
- **Description**: Verifies payment token, validates active seat hold, and permanently books tickets.
- **Request Body**:
  ```json
  {
    "holdId": "hld_48102a",
    "paymentToken": "tok_visa_42424242",
    "billingAddress": { "country": "UK", "postcode": "SW1A 1AA" }
  }
  ```
- **Success Status**: `201 Created`
- **Response Example**:
  ```json
  {
    "orderId": "ord_77189",
    "status": "confirmed",
    "totalPaid": 150.00,
    "tickets": [
      { "ticketId": "tkt_55102", "seatId": "seat_A101", "barcode": "TKT-9812-A101-77189" }
    ]
  }
  ```

---

### 5. View Purchased Tickets
- **Method & Path**: `GET /api/v1/users/me/tickets`
- **Description**: Lists all confirmed tickets owned by the authenticated user with event details and scannable QR payloads.
- **Success Status**: `200 OK`

---

## 4. Relational Data Model & Schema

```
+---------------+           +---------------+
|     users     |           |    events     |
+---------------+           +---------------+
        | 1                         | 1
        |                           |
        | Places                    | Contains
        v N                         v N
+---------------+           +---------------+
|    orders     | 1       N |     seats     |
+---------------+<----------+---------------+
        | 1                         ^
        |                           |
        | Generates                 |
        v N                         |
+---------------+                   |
|    tickets    |-------------------+
+---------------+ (Unique seat_id constraint)
```

### Table Definitions & Constraints

```sql
-- 1. Users Table
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Events Table
CREATE TABLE events (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    venue VARCHAR(150) NOT NULL,
    event_date TIMESTAMP NOT NULL,
    total_capacity INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'published', -- 'draft', 'published', 'sold_out'
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Seats Table
CREATE TABLE seats (
    id VARCHAR(36) PRIMARY KEY,
    event_id VARCHAR(36) NOT NULL,
    section VARCHAR(50) NOT NULL,
    row_label VARCHAR(10) NOT NULL,
    seat_number INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'available', -- 'available', 'held', 'booked'
    held_by_user_id VARCHAR(36) NULL,
    held_until TIMESTAMP NULL,
    version INT NOT NULL DEFAULT 1, -- Optimistic concurrency control counter
    CONSTRAINT fk_seat_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_seat_held_user FOREIGN KEY (held_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_event_seat_coord UNIQUE (event_id, section, row_label, seat_number)
);

-- 4. Orders Table
CREATE TABLE orders (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    event_id VARCHAR(36) NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed', -- 'pending', 'confirmed', 'refunded'
    payment_reference VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- 5. Tickets Table (Hard Unique Constraint on Confirmed Seats)
CREATE TABLE tickets (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL,
    seat_id VARCHAR(36) NOT NULL UNIQUE, -- PREVENTS ANY SEAT BEING DUPLICATE-PURCHASED
    barcode VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ticket_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_seat FOREIGN KEY (seat_id) REFERENCES seats(id) ON DELETE CASCADE
);
```

---

## 5. Preventing Double-Booking: Concurrency Control

Preventing two users from acquiring or purchasing the same seat requires a multi-layered defense combining atomic conditional writes, optimistic concurrency, and unique relational constraints.

### Layer 1: Atomic Hold Acquisition via Optimistic Conditional Update
When User A requests to hold Seat 101, the application executes an **atomic conditional update** that succeeds if and only if the seat is either genuinely `available` or has an expired hold (`held_until < NOW()`):

```sql
UPDATE seats
SET status = 'held',
    held_by_user_id = :userId,
    held_until = CURRENT_TIMESTAMP + INTERVAL '10 minutes',
    version = version + 1
WHERE id = :seatId
  AND (
    status = 'available' 
    OR (status = 'held' AND held_until < CURRENT_TIMESTAMP)
  );
```

- **Concurrency Guarantee**: Relational databases (e.g., PostgreSQL/MySQL) lock the single row during the `UPDATE`. If 100 users attempt to hold the exact same seat at the identical millisecond, the database serializes the write:
  - **First user**: Matches the `WHERE` clause, updates row count = `1`. Hold granted!
  - **Remaining 99 users**: The row status is now `held` with a future `held_until`. Row count = `0`. The API immediately returns `409 Conflict ("Seat is currently held by another user")`.

---

### Layer 2: Final Payment & Purchase ACID Transaction (`SELECT FOR UPDATE`)
When User A submits payment, the checkout is executed inside a strict database transaction with row-level pessimistic locking:

```sql
BEGIN TRANSACTION;

-- 1. Lock the row exclusively so no other thread can inspect or alter it
SELECT id, status, held_by_user_id, held_until 
FROM seats 
WHERE id = :seatId 
FOR UPDATE;

-- 2. Verify that the hold still belongs to this user and has not expired
-- (If held_by_user_id != :userId OR held_until < CURRENT_TIMESTAMP, ROLLBACK!)

-- 3. Mark seat permanently booked
UPDATE seats 
SET status = 'booked', 
    held_by_user_id = NULL, 
    held_until = NULL 
WHERE id = :seatId;

-- 4. Insert order and ticket
INSERT INTO orders (id, user_id, event_id, total_amount, payment_reference)
VALUES (:orderId, :userId, :eventId, :amount, :paymentRef);

INSERT INTO tickets (id, order_id, seat_id, barcode)
VALUES (:ticketId, :orderId, :seatId, :barcode);

COMMIT;
```

---

### Layer 3: Database-Level Uniqueness Enforcement
The `tickets` table enforces a hard constraint: `seat_id VARCHAR(36) NOT NULL UNIQUE`. Even in the catastrophic event of an application software bug or distributed lock glitch, the database engine physically rejects any attempt to insert a second ticket for the same `seat_id` with a database primary constraint violation, guaranteeing **zero double-booking at the hardware level**.

---

## 6. Architecture Diagram & Surviving the Big Sale

```
                                +--------------------+
                                |    200,000 Users   |
                                +---------+----------+
                                          |
                                          v
                                +--------------------+
                                |     DNS Layer      |
                                | (Route 53/Anycast) |
                                +---------+----------+
                                          |
                                          v
                                +--------------------+
                                |     Global CDN     |
                                | (Edge Static Cache)|
                                +---------+----------+
                                          |
                                          v
                                +--------------------+
                                | Virtual Waiting    |
                                |  Room (FIFO Queue) |
                                +---------+----------+
                                          | (Metered Admission: 500 users/sec)
                                          v
                                +--------------------+
                                |   Load Balancer    |
                                +---------+----------+
                                          |
                        +-----------------+-----------------+
                        |                                   |
                        v                                   v
             +--------------------+               +--------------------+
             |    App Server 1    |               |    App Server N    |
             |  (Node/Go Cluster) |               |    (Auto-scaled)   |
             +----+-----------+---+               +----+-----------+---+
                  |           |                        |           |
                  |           +-----------+ +----------+           |
                  |                       | |                      |
                  v                       v v                      v
       +--------------------+    +--------------------+   +--------------------+
       |   Redis Cluster    |    |  Primary Database  |   |   Payment Engine   |
       |  (Seat Availability|    |  (PostgreSQL Write |   |  (Stripe / Adyen)  |
       |   Bitmap & Locks)  |    |       Master)      |   +--------------------+
       +--------------------+    +---------+----------+              |
                                           |                         v
                                           | Async Sync   +--------------------+
                                           v              |   Message Queue    |
                                 +--------------------+   |  (RabbitMQ / SQS)  |
                                 |  Read Replicas (3) |   +---------+----------+
                                 |  (Catalog Queries) |             |
                                 +--------------------+             v
                                                          +--------------------+
                                                          | Background Worker  |
                                                          | (PDF/Email QR Gen) |
                                                          +--------------------+
```

### How the Architecture Survives the Big Sale

1. **Virtual Waiting Room (Queue Shock Absorber)**: 
   During flash ticket drops, 200,000 users arrive simultaneously. A reverse-proxy waiting room (e.g., Cloudflare Waiting Room or Redis Token Bucket) intercepts all traffic before it reaches origin servers. It meters users into the ticketing application at a sustainable rate (e.g., 500 users per second), presenting a polite queue position screen ("You are #1,420 in line"). This prevents the database and backend servers from collapsing under catastrophic connection saturation.
2. **CDN Edge Caching**:
   Static venue layouts, seat coordinate maps, and event descriptions are cached at global CDN points of presence with high TTLs. 95% of incoming read traffic never touches backend application servers.
3. **Redis Real-Time Seat Availability Bitmaps**:
   Seat status (`0` for available, `1` for held/booked) is maintained in Redis Bitmaps. Polling queries from active browsers checking if a seat is taken are served entirely from RAM ($<1\text{ ms}$ latency), completely shielding the database from the 6,667 QPS seat map read surges.
4. **Primary-Replica Database Isolation**:
   All event browsing and catalog search traffic is routed to **Read Replicas**, leaving the **Primary Database Master** 100% dedicated to processing hold updates and payment commit transactions without resource contention.
5. **Asynchronous Post-Processing via Message Queue**:
   Once payment is authorized and the seat is committed, the application delegates PDF generation, email receipts, and digital barcode signing to a background worker pool via a message queue, keeping checkout response times under 200 ms.

---

## 7. Architectural Trade-Offs

### Trade-Off 1: Virtual Waiting Room (Fairness & Stability) vs. Direct Access (Simplicity)
- **Decision**: Implemented a FIFO Virtual Waiting Room to gate admission during high-concurrency ticket drops.
- **Advantage**: Protects infrastructure from denial-of-service collapse. Guarantees true fairness where users who arrive first are served first, eliminating bot advantage and network jitter bias.
- **Downside**: Increased architectural complexity and user friction; users cannot immediately browse tickets without waiting in a queue during peak surges.

### Trade-Off 2: Short 10-Minute Hold Window vs. Long Cart Reservation
- **Decision**: Imposed a strict 10-minute maximum hold duration enforced by automated background TTL expiration.
- **Advantage**: Prevents seat hoarding and inventory starvation. If a buyer abandons their cart or experiences card failure, the seat returns to the live pool quickly so other fans can purchase it.
- **Downside**: High urgency for users; customers who take longer than 10 minutes to enter payment details lose their selected seats, causing customer support friction.

### Trade-Off 3: Read Replica Lag (Eventual Consistency) vs. Direct Primary Reads
- **Decision**: Serving event details and general seat counts from asynchronous Read Replicas and Redis, reserving the Primary DB exclusively for the final atomic hold/purchase transaction.
- **Advantage**: Massively scales read throughput to over 6,000 QPS without overloading the primary database master.
- **Downside**: Replicas can experience minor replication lag (50–200 ms). A seat that was just held on the primary might still appear available on the map for a split-second. The atomic conditional write on the primary catches this gracefully and returns a clean conflict notice to the second buyer.
