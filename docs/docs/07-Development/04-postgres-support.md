# PostgreSQL Support for Karakeep

Karakeep now supports PostgreSQL as an alternative to SQLite, enabling users to host their database remotely or use more advanced database features.

## Configuration

### Using Environment Variables

Set the following environment variables to use PostgreSQL:

```bash
# Basic configuration with connection string
DB_TYPE=postgres
DATABASE_URL=postgresql://username:password@localhost:5432/karakeep

# Or configure individual connection parameters
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USER=karakeep
DB_PASSWORD=your_password
DB_NAME=karakeep
```

### Environment File

Add to your `.env` file:

```env
# Database Configuration
DB_TYPE=postgres
DATABASE_URL=postgresql://karakeep:password@localhost:5432/karakeep
```

## Database Setup

### 1. Create PostgreSQL Database

Create a PostgreSQL database for Karakeep:

```sql
CREATE DATABASE karakeep;
CREATE USER karakeep WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE karakeep TO karakeep;
```

### 2. Generate and Run Migrations

Generate PostgreSQL migrations:

```bash
pnpm db:generate:postgres
```

Run the migrations:

```bash
DB_TYPE=postgres pnpm db:migrate
```

### 3. Database Studio (Optional)

Access PostgreSQL database studio:

```bash
pnpm db:studio:postgres
```

## Development

### Generate New Migrations

When you modify the schema:

```bash
# For PostgreSQL
pnpm db:generate:postgres

# For SQLite (default)
pnpm db:generate
```

### Migration Files

- SQLite migrations: `packages/db/drizzle/`
- PostgreSQL migrations: `packages/db/drizzle-postgres/`

## Switching Between Databases

You can switch between SQLite and PostgreSQL by changing the `DB_TYPE` environment variable:

- `DB_TYPE=sqlite` (default) - Uses SQLite
- `DB_TYPE=postgres` - Uses PostgreSQL

## Benefits of PostgreSQL

- **Remote hosting**: Host your database on a separate server
- **Scalability**: Better performance for large datasets
- **Advanced features**: Full-text search, JSON support, etc.
- **Concurrent access**: Better support for multiple users
- **Backup and replication**: Enterprise-grade backup solutions

## Notes

- Both database types use the same application code
- Migrations are generated separately for each database type
- Schema definitions are maintained in parallel for compatibility
- Default remains SQLite for ease of setup