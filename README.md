# Forward Proxy

A path-based HTTP/HTTPS forward proxy with user authentication and route-based access control. This proxy routes requests to different upstream services based on URL paths and enforces user-based permissions.

## Features

- **Path-based routing**: Route requests to different upstream services based on URL paths
- **User authentication**: Support for user ID-based authentication via headers or Bearer tokens
- **Route permissions**: Configure which users can access which routes
- **Method restrictions**: Control which HTTP methods are allowed per route
- **Environment variable support**: Use environment variables in configuration
- **HTTPS tunneling**: Support for CONNECT method for HTTPS tunneling
- **Comprehensive logging**: Log all attempts and errors for monitoring
- **Header management**: Automatic removal of proxy-specific headers
-**No External Dependencies**: It has no external deps

## Quick Start

1. **Install dependencies**: No external dependencies required (uses Node.js built-ins)

2. **Configure the proxy**: Edit `config.json` or use environment variables

3. **Start the proxy**:
   ```bash
   node proxy.js
   ```

4. **Test with curl**:
   ```bash
   curl -H "X-User-ID: 11111111-1111-1111-1111-111111111111" \
        http://localhost:3128/jsonplaceholder/posts/1
   ```

## Configuration

### Basic Configuration (config.json)

```json
{
  "Routes": {
    "JSONPlaceholder": {
      "path": "/jsonplaceholder",
      "upstream": "https://jsonplaceholder.typicode.com",
      "PermittedMethods": ["GET", "POST", "PUT", "DELETE"],
      "PermittedUsers": ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"]
    },
    "HTTPBin": {
      "path": "/httpbin",
      "upstream": "https://httpbin.org",
      "PermittedMethods": ["GET", "POST", "PUT", "DELETE"],
      "PermittedUsers": ["11111111-1111-1111-1111-111111111111"]
    }
  },
  "AllUsers": [
    "11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222"
  ]
}
```

### Environment Variables

You can use environment variables in your configuration:

```json
{
  "Routes": {
    "API": {
      "path": "${API_PATH}",
      "upstream": "${API_UPSTREAM}",
      "PermittedMethods": ["GET", "POST"],
      "PermittedUsers": ["${USER_1_ID}", "${USER_2_ID}"]
    }
  },
  "AllUsers": ["${USER_1_ID}", "${USER_2_ID}"]
}
```

Set the environment variables:
```bash
export API_PATH="/api"
export API_UPSTREAM="https://api.example.com"
export USER_1_ID="11111111-1111-1111-1111-111111111111"
export USER_2_ID="22222222-2222-2222-2222-222222222222"
```

## Configuration Options

### Route Configuration

Each route in the `Routes` object supports:

- **`path`** (required): The URL path prefix to match (e.g., `/api`, `/users`)
- **`upstream`** (required): The target upstream URL (e.g., `https://api.example.com`)
- **`PermittedMethods`** (optional): Array of allowed HTTP methods (default: all methods)
- **`PermittedUsers`** (optional): Array of user IDs allowed to access this route

### Global Configuration

- **`AllUsers`**: Array of all valid user IDs in the system

## Authentication

The proxy supports multiple authentication methods:

### 1. X-User-ID Header
```bash
curl -H "X-User-ID: 11111111-1111-1111-1111-111111111111" \
     http://localhost:3128/api/users
```

### 2. X_User_ID Header (alternative)
```bash
curl -H "X_User_ID: 11111111-1111-1111-1111-111111111111" \
     http://localhost:3128/api/users
```

### 3. Bearer Token
```bash
curl -H "Authorization: Bearer 11111111-1111-1111-1111-111111111111" \
     http://localhost:3128/api/users
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Proxy listening port | `3128` |
| `CONFIG` | Path to config file | `./config.json` |

## Usage Examples

### Basic HTTP Request
```bash
# Get a post from JSONPlaceholder
curl -H "X-User-ID: 11111111-1111-1111-1111-111111111111" \
     http://localhost:3128/jsonplaceholder/posts/1
```

### POST Request
```bash
# Create a new post
curl -X POST \
     -H "X-User-ID: 11111111-1111-1111-1111-111111111111" \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","body":"Test body"}' \
     http://localhost:3128/jsonplaceholder/posts
```

### HTTPS Tunneling (CONNECT)
```bash
# Use the proxy for HTTPS connections
curl --proxy http://localhost:3128 \
     -H "X-User-ID: 11111111-1111-1111-1111-111111111111" \
     https://api.example.com/data
```

## Logging

The proxy creates detailed logs in the `logs/` directory:

- **`attempts.log`**: All request attempts (allowed and denied)
- **`errors.log`**: System errors and warnings

### Log Format
```json
{
  "ts": "2025-09-21T11:33:02.753Z",
  "action": "denied",
  "reason": "user_not_permitted_for_route",
  "clientIp": "::1",
  "method": "GET",
  "url": "/api/users",
  "route": "API",
  "userId": "22222222-2222-2222-2222-222222222222"
}
```

## Error Responses

| Status | Description |
|--------|-------------|
| `401 Unauthorized` | Missing or unknown user ID |
| `403 Forbidden` | No matching route or user not permitted |
| `405 Method Not Allowed` | HTTP method not allowed for route |
| `502 Bad Gateway` | Upstream connection error |
| `500 Internal Server Error` | Configuration or processing error |

## Security Features

- **User-based access control**: Each route can restrict access to specific users
- **Method restrictions**: Control which HTTP methods are allowed per route
- **Header sanitization**: Automatic removal of proxy-specific headers
- **Path-based isolation**: Routes are isolated by URL path prefixes
- **Comprehensive logging**: All access attempts are logged for audit

## Development

### Requirements
- Node.js 18+ (recommended)

### File Structure
```
Forward Proxy/
├── proxy.js          # Main proxy server
├── config.json       # Configuration file
├── logs/             # Log directory
│   ├── attempts.log  # Request attempt logs
│   └── errors.log    # Error logs
└── README.md         # This file
```

### Testing

- Install dev dependencies (already in `package.json`):
  ```bash
  npm install
  ```

- Run the unit tests:
  ```bash
  npm test
  ```

- Watch mode:
  ```bash
  npm run test:watch
  ```

Notes:
- Tests run with `NODE_ENV=test`. The proxy server is guarded to not listen during tests.
- Helper APIs available for tests: `extractPathnameAndQuery`, `joinPaths`, `stripNginxHeaders`, `findRouteByPathWithRoutes`.

## License

This project is Propritary
