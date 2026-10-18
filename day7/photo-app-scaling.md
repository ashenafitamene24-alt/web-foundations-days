# SnapShare — System Architecture & Scaling Plan

A comprehensive scaling and infrastructure design for **SnapShare**, a high-scale photo-sharing application where users upload photos and browse a real-time feed of photos from people they follow.

---

## 1. System Assumptions & Scale Estimates

### Baseline Facts
- **Registered Users**: 10,000,000 (10 Million)
- **Active User Rate**: 10% active daily
- **Photo Uploads**: 1 photo per active user per day
- **Feed Browsing**: 50 feed page views per active user per day
- **Average Photo Size**: 2 MB
- **Thumbnail Size**: 50 KB per photo
- **Seconds in a Day**: 86,400 seconds
- **Peak Traffic Multiplier**: 5× average load

---

### Quantitative Calculations

#### A. Daily Active Users (DAU)
$$\text{DAU} = 10,000,000 \times 10\% = 1,000,000\text{ (1 Million DAU)}$$

#### B. Uploads per Second
- **Total Uploads per Day**:
  $$1,000,000 \text{ DAU} \times 1 \text{ upload/day} = 1,000,000 \text{ uploads/day}$$
- **Average Uploads per Second**:
  $$\frac{1,000,000 \text{ uploads}}{86,400 \text{ seconds}} \approx 11.57 \text{ uploads/sec}$$
- **Peak Uploads per Second (5×)**:
  $$11.57 \times 5 \approx 57.87 \text{ uploads/sec (}\approx 58 \text{ uploads/sec)}$$

#### C. Feed Views per Second
- **Total Feed Views per Day**:
  $$1,000,000 \text{ DAU} \times 50 \text{ views/day} = 50,000,000 \text{ feed views/day}$$
- **Average Feed Views per Second**:
  $$\frac{50,000,000 \text{ views}}{86,400 \text{ seconds}} \approx 578.70 \text{ views/sec}$$
- **Peak Feed Views per Second (5×)**:
  $$578.70 \times 5 \approx 2,893.52 \text{ views/sec (}\approx 2,894 \text{ views/sec)}$$

#### D. Photo Storage per Year
- **Storage per Photo Upload**:
  $$2 \text{ MB (original)} + 0.05 \text{ MB (50 KB thumbnail)} = 2.05 \text{ MB per upload}$$
- **Daily Storage Consumption**:
  $$1,000,000 \text{ uploads/day} \times 2.05 \text{ MB} = 2,050,000 \text{ MB/day} = 2.05 \text{ TB/day}$$
- **Annual Storage Consumption**:
  $$2.05 \text{ TB/day} \times 365 \text{ days} = \mathbf{748.25 \text{ TB/year}}$$

---

## 2. Read-Heavy vs. Write-Heavy Analysis

### Workload Classification
- **Daily Reads (Feed Views)**: 50,000,000
- **Daily Writes (Photo Uploads)**: 1,000,000
- **Read-to-Write Ratio**: **50 : 1**

### What This Means for System Design
SnapShare is overwhelmingly **read-heavy** (reads constitute ~98% of overall user requests). 

This architectural reality dictates the following design choices:
1. **Aggressive Multi-Tier Caching**: Since users repeatedly consume content, active feed timelines and frequently accessed user profiles must be cached in memory (Redis/Memcached) to minimize database lookups.
2. **Edge Media Offloading (CDN)**: Raw images and thumbnails must never be streamed directly from backend application servers or object storage on every read. A global Content Delivery Network (CDN) caches images close to users, serving the vast majority of image reads from edge points of presence.
3. **Database Read Scaling**: The database workload is decoupled into a **Primary Database** (dedicated to processing incoming writes and maintaining ACID consistency) and multiple **Read Replicas** that horizontally scale feed generation queries.

---

## 3. Storage Strategy: Why Databases Should Not Store Photos

Photos and media files must **never be stored directly inside a relational database** (e.g., as binary `BLOB` columns) for the following reasons:
- **Buffer Pool & Memory Starvation**: Storing 2 MB binary files inside database tables rapidly evicts index and query pages from RAM buffer pools, severely degrading overall query performance.
- **Table Bloat & I/O Overhead**: Disk page sizes and table sizes inflate massively, rendering table scans, index traversals, and disk seek operations extremely sluggish and expensive.
- **Operational Headaches**: Backups, point-in-time recovery, database migrations, and replication across replicas become prohibitively slow and resource-heavy when transferring hundreds of terabytes of binary data.

### The Solution: Cloud Object Storage
Instead, all binary files (original photos and thumbnails) are stored in **distributed Object Storage** (such as Amazon S3, Google Cloud Storage, or MinIO). Object storage is specifically designed for virtually unlimited, highly durable (99.999999999%), and cost-effective storage of unstructured binary assets. 

The database only stores lightweight metadata (e.g., `id`, `user_id`, `created_at`, `caption`, and the immutable object storage URI / S3 key).

---

## 4. Architecture Diagram

```
                              +--------------------+
                              |     End Users      |
                              |  (Mobile / Web)    |
                              +---------+----------+
                                        |
                 +----------------------+----------------------+
                 | (Static Media / Thumbnails)                 | (API Requests)
                 v                                             v
        +-----------------+                           +-----------------+
        |  CDN (Edge)     |                           |  Load Balancer  |
        +--------+--------+                           +--------+--------+
                 | (Cache Miss)                                |
                 |                                             v
                 |                                    +-----------------+
                 |                                    |   App Servers   |
                 |                                    |    (Cluster)    |
                 |                                    +---+-----+---+---+
                 |                                        |     |   |
                 |               +------------------------+     |   +-----------------------+
                 |               |                              |                           |
                 v               v                              v                           v
        +-----------------------------+               +------------------+         +------------------+
        |       Object Storage        |               | In-Memory Cache  |         |  Message Queue   |
        |  (Raw Photos & Thumbnails)  |               |  (Redis/Cluster) |         | (RabbitMQ / SQS) |
        +--------------+--------------+               +------------------+         +--------+---------+
                       ^                                                                    |
                       | (Save Thumbnail)                                                   | (Job)
                       |                                                                    v
                       |      +------------------------+                           +------------------+
                       +------+   Background Worker    |<--------------------------+  Worker Service  |
                              |   (Thumbnail Creator)  |                           +------------------+
                              +-----------+------------+
                                          |
                                          | (Update Record)
                                          v
                              +------------------------+     Async Sync    +------------------+
                              |    Primary Database    |------------------>|  Read Replica(s) |
                              |        (Writes)        |                   |     (Reads)      |
                              +------------------------+                   +------------------+
```

---

## 5. Component Breakdown (One Sentence Per Component)

1. **Content Delivery Network (CDN)**: Caches static images and thumbnails at geographically distributed edge servers to deliver content with ultra-low latency and offload traffic from backend infrastructure.
2. **Load Balancer**: Distributes incoming HTTP/HTTPS application traffic uniformly across available application servers to prevent bottlenecks and eliminate single points of failure.
3. **Application Servers**: Executes business logic, handles user authentication, coordinates metadata persistence, streams uploads to object storage, and serves dynamic API responses.
4. **In-Memory Cache (Redis)**: Stores precomputed user home feeds, social graph relationships, and hot sessions in RAM to satisfy read queries in single-digit milliseconds.
5. **Primary Database (SQL)**: Serves as the authoritative source of truth for all transactional writes, user accounts, relationships, and photo metadata with strict ACID compliance.
6. **Read Replica Database**: Replicates data asynchronously from the primary database to serve high-volume read queries and feed requests without degrading write throughput.
7. **Object Storage**: Provides an infinitely scalable, highly durable, and cost-effective distributed repository for storing raw photo binaries and generated thumbnails.
8. **Message Queue (e.g., RabbitMQ / AWS SQS)**: Decouples upload handling from thumbnail creation by buffering image processing tasks for asynchronous execution.
9. **Background Worker (Thumbnail Creator)**: Consumes jobs from the message queue, resizes the 2 MB raw photo down to a 50 KB thumbnail, uploads it to object storage, and updates the database record.

---

## 6. Step-by-Step Flow: Uploading a Photo

1. **Upload Request**: The client application issues an authenticated `POST /api/photos` request containing the photo binary (2 MB) and accompanying metadata (caption, timestamp) to the **Load Balancer**.
2. **Traffic Routing**: The **Load Balancer** routes the request to the least loaded **Application Server**.
3. **Binary Persistence**: The **Application Server** validates the media format and directly streams the 2 MB raw image into **Object Storage** under a unique key path (e.g., `/raw/{photo_id}.jpg`).
4. **Metadata Creation**: Upon receiving an upload confirmation from object storage, the **Application Server** writes a new row to the **Primary Database** containing the photo's metadata (`photo_id`, `user_id`, raw S3 URL, timestamp, and status set to `processing`).
5. **Task Enqueueing**: The **Application Server** publishes an asynchronous thumbnail generation task containing the `photo_id` and raw object storage path to the **Message Queue**.
6. **Immediate User Response**: The **Application Server** returns an immediate `201 Created` HTTP response with the photo metadata to the user, ensuring the user experience remains fast without waiting for resizing.
7. **Job Consumption**: A **Background Worker** pulls the image processing message off the **Message Queue**.
8. **Thumbnail Generation**: The worker downloads the raw image from **Object Storage**, compresses and resizes it into a 50 KB thumbnail, and uploads the thumbnail back to **Object Storage** (e.g., `/thumbs/{photo_id}.jpg`).
9. **State Finalization & Cache Invalidation**: The worker updates the photo record in the **Primary Database** with the new thumbnail URL (setting status to `ready`) and adds the photo ID to the user's followers' feed caches in the **In-Memory Cache**.

---

## 7. Architectural Trade-Offs

### Trade-Off 1: Asynchronous Processing vs. Synchronous Processing for Thumbnails
- **Decision**: Generating thumbnails asynchronously via a message queue and worker pool rather than synchronously within the upload request cycle.
- **Advantage**: Dramatic reduction in upload latency. Synchronously resizing 2 MB images into thumbnails during the upload request would tie up application server threads for hundreds of milliseconds, consume excessive memory, and lead to request timeouts during traffic spikes.
- **Downside**: Introduces **eventual consistency**. When a user immediately refreshes their feed right after uploading, the thumbnail may not be available for 1 to 2 seconds until the worker finishes processing, necessitating client-side fallback handling (such as displaying a local preview or loading placeholder).

### Trade-Off 2: Fan-Out on Write (Push) vs. Fan-Out on Read (Pull) for Feeds
- **Decision**: Adopting a hybrid feed architecture where regular users utilize **Fan-Out on Write** (precomputing followers' feeds in Redis upon photo upload), while high-follower accounts (celebrities/influencers) utilize **Fan-Out on Read** (merging feeds at query time).
- **Advantage**: For 99% of users, feed browsing is an instantaneous $O(1)$ cache read, achieving the sub-50ms latency required for smooth infinite-scroll experiences at 2,894 peak views/sec.
- **Downside**: For users with millions of followers, a pure Fan-Out on Write model causes massive write amplification (a single photo upload would trigger millions of cache write operations, choking the message queue and cache cluster). The hybrid model introduces additional algorithmic complexity to merge celebrity posts into the cached timeline dynamically at read time.

### Trade-Off 3: Strong Consistency vs. Eventual Consistency on Read Replicas
- **Decision**: Leveraging asynchronous database replication to Read Replicas rather than synchronous replication.
- **Advantage**: Write operations to the Primary Database complete immediately without waiting for replicas across multiple availability zones to acknowledge the write, maximizing write throughput and system availability.
- **Downside**: Introduces **replication lag** (typically a few milliseconds to seconds). If a user modifies their caption or profile and is immediately routed to a replica that has not caught up, they may observe stale data. To mitigate this, user-initiated read-after-write requests are routed to the Primary Database or served directly from cache for a brief window.
