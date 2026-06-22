# Implementation Plan: BDIX IPTV Website

## Overview

A Node.js backend (Express) + vanilla JavaScript frontend website that fetches an M3U playlist from a GitHub source, validates channel availability via concurrent HEAD requests, and displays only working channels in a responsive grid. The system uses SSE for real-time progress updates and auto-refreshes every 30 minutes.

## Tasks

- [x] 1. Set up project structure and core interfaces
  - [x] 1.1 Initialize project and install dependencies
    - Create `package.json` with scripts for start, dev, and test
    - Install Express, node-fetch (or use native fetch if Node 18+)
    - Install dev dependencies: vitest, fast-check, msw, jsdom
    - Create directory structure: `src/server/`, `src/client/`, `tests/`
    - Create `vitest.config.js` with jsdom environment for client tests
    - _Requirements: All (project foundation)_

  - [x] 1.2 Create configuration module
    - Create `src/server/config.js` with constants: `SOURCE_URL`, `FETCH_TIMEOUT` (15000ms), `VALIDATE_TIMEOUT` (10000ms), `MAX_CONCURRENCY` (20), `MAX_REDIRECTS` (5), `UPDATE_INTERVAL` (30 min), `MIN_INTERVAL` (5 min), `MAX_INTERVAL` (24 hours)
    - Implement interval clamping function that enforces min/max bounds
    - _Requirements: 5.1_

  - [ ]* 1.3 Write property test for interval clamping
    - **Property 5: Update Interval Clamping**
    - Generate random numbers (including negatives, zero, very large), verify clamping to [5 min, 24 hours]
    - **Validates: Requirements 5.1**

- [x] 2. Implement M3U parser
  - [x] 2.1 Implement M3U parser module
    - Create `src/server/m3uParser.js`
    - Validate `#EXTM3U` header presence
    - Extract channel name from text after last comma on `#EXTINF` line
    - Extract `tvg-logo` attribute value (default to empty string if missing)
    - Extract stream URL from next non-empty, non-comment line after `#EXTINF`
    - Skip entries without valid stream URL
    - Return empty array with console warning for invalid format
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6_

  - [ ]* 2.2 Write property test for M3U parsing round-trip
    - **Property 1: M3U Parsing Round-Trip**
    - Generate arrays of Channel objects with random names (1-100 chars), random valid URLs, random logo URLs (including empty); serialize to M3U then parse back; verify identical field values
    - **Validates: Requirements 2.4**

  - [ ]* 2.3 Write property test for M3U format validation
    - **Property 2: M3U Format Validation**
    - Generate random strings (both valid M3U structures and arbitrary content); verify parser produces non-empty list iff input starts with `#EXTM3U` and contains valid `#EXTINF` + stream URL pairs
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 2.4 Write unit tests for M3U parser edge cases
    - Test: valid M3U with multiple entries, verify exact field extraction
    - Test: missing tvg-logo attribute yields empty string logoUrl
    - Test: entries without stream URL are skipped
    - Test: empty content returns empty array
    - Test: content without #EXTM3U header returns empty array
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6_

- [x] 3. Implement channel validator
  - [x] 3.1 Implement channel validator module
    - Create `src/server/channelValidator.js`
    - Issue HTTP HEAD requests to each channel stream URL
    - Follow up to 5 redirects
    - Set 10-second timeout per request using AbortController
    - Classify 2xx responses as working, all others as non-working
    - Classify timeouts and connection errors as non-working
    - Implement concurrency pool limiting to 20 simultaneous requests
    - Accept `onProgress` callback for reporting validation progress
    - Return only working channels
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 3.2 Write property test for HTTP status classification
    - **Property 3: HTTP Status Classification**
    - Generate random integers 100-599; verify classification returns working iff status is 200-299
    - **Validates: Requirements 3.2, 3.4**

  - [ ]* 3.3 Write unit tests for channel validator
    - Mock HTTP responses using msw for specific scenarios: 200 OK, 301→200 redirect, 404, 500, timeout, connection refused
    - Verify concurrency limit of 20 simultaneous requests
    - Verify onProgress callback is invoked with correct counts
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Implement playlist fetcher
  - [x] 4.1 Implement playlist fetcher module
    - Create `src/server/playlistFetcher.js`
    - Fetch M3U content from Source_URL with 15-second timeout
    - Append unique cache-busting query parameter (`_t=<timestamp>`) to each request
    - Return `{ success, content, error }` result object
    - Handle network errors, DNS failures, and HTTP error responses gracefully
    - _Requirements: 1.1, 1.2, 1.3, 5.4_

  - [ ]* 4.2 Write property test for cache-busting uniqueness
    - **Property 6: Cache-Busting Uniqueness**
    - Generate random base URLs; call cache-bust function twice in succession; verify appended parameter values differ
    - **Validates: Requirements 5.4**

  - [ ]* 4.3 Write unit tests for playlist fetcher
    - Mock fetch responses using msw
    - Test: successful fetch returns content
    - Test: network error returns error result
    - Test: timeout returns error result
    - Test: HTTP 404/500 returns error result
    - Test: cache-busting parameter is appended to URL
    - _Requirements: 1.1, 1.2, 5.4_

- [x] 5. Checkpoint - Backend core modules complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement API routes with SSE support
  - [x] 6.1 Create Express server and API routes
    - Create `src/server/app.js` with Express app setup
    - Implement `GET /api/channels` endpoint that orchestrates: fetch → parse → validate → respond with JSON `{ channels, total, working }`
    - Implement `GET /api/channels/stream` SSE endpoint that sends progress events during validation (`{ type: "progress", validated, total }`), completion event (`{ type: "complete", channels, total, working }`), and error events (`{ type: "error", message }`)
    - Serve static files from `src/client/` directory
    - Create `src/server/index.js` as entry point that starts the server
    - _Requirements: 1.1, 1.3, 3.7, 6.2, 6.3_

  - [ ]* 6.2 Write integration tests for API routes
    - Test full pipeline: fetch → parse → validate → response using msw for external HTTP mocking
    - Test SSE endpoint delivers progress and complete events
    - Test error scenarios return appropriate error events
    - _Requirements: 1.1, 1.2, 3.7, 6.2, 6.3_

- [x] 7. Implement frontend display
  - [x] 7.1 Create HTML page and CSS styles
    - Create `src/client/index.html` with semantic structure: header, loading area, progress area, channel grid container, error area
    - Create `src/client/styles.css` with responsive grid layout: min 2 columns at 480px+, single column below 480px
    - Style channel cards with logo image and name
    - Style loading spinner, progress bar/text, and error message with retry button
    - _Requirements: 4.1, 4.3, 4.6, 6.1_

  - [x] 7.2 Implement channel display module
    - Create `src/client/channelDisplay.js`
    - Implement `renderChannels(channels)`: render channel cards in grid with name and logo
    - Implement `showLoading()`: show loading indicator, hide channels
    - Implement `showProgress(validated, total)`: show progress text "X of Y channels validated"
    - Implement `showError(message, retryCallback)`: show error with retry button
    - Implement `showNoChannels()`: show message when zero working channels
    - Handle logo load errors with placeholder image and channel name fallback
    - Truncate channel names longer than 50 characters with ellipsis
    - Make each channel card clickable, opening stream URL in new tab
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 6.1, 6.2, 6.4, 6.5_

  - [ ]* 7.3 Write property test for channel name truncation
    - **Property 4: Channel Name Truncation**
    - Generate random strings 0-200 chars; verify names ≤50 chars returned unchanged, names >50 chars truncated to 50 chars + ellipsis
    - **Validates: Requirements 4.2**

  - [ ]* 7.4 Write property test for progress format string
    - **Property 7: Progress Format String**
    - Generate random (validated, total) pairs where 0 ≤ validated ≤ total; verify output is "{validated} of {total} channels validated"
    - **Validates: Requirements 6.2**

- [x] 8. Implement frontend controller with auto-update
  - [x] 8.1 Implement frontend controller module
    - Create `src/client/controller.js`
    - Implement `initialize()`: connect to SSE endpoint, trigger first fetch
    - Implement `fetchAndDisplay()`: connect to `/api/channels/stream` via EventSource, handle progress/complete/error events, update display accordingly
    - Implement `startAutoUpdate(intervalMs)`: schedule periodic re-fetches at configured interval (default 30 min)
    - Implement `stopAutoUpdate()`: clear interval timer
    - During auto-update: show progress indicator without removing currently displayed channels
    - Handle SSE connection loss: fallback to polling, show reconnection indicator
    - Compare new channel data to current state before re-rendering to avoid unnecessary DOM updates
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 6.1, 6.2, 6.3, 6.6_

  - [ ]* 8.2 Write unit tests for frontend controller
    - Test: initial load triggers SSE connection and shows loading state
    - Test: progress events update display with validated/total counts
    - Test: complete event renders channels and shows summary
    - Test: error event shows error message with retry option
    - Test: auto-update re-fetches without clearing existing channels
    - Test: failed re-fetch retains current channel list
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 6.1, 6.2, 6.3, 6.6_

- [x] 9. Final checkpoint - Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Tech stack: Node.js, Express, vanilla JavaScript, Vitest, fast-check, msw, jsdom

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "4.1"] },
    { "id": 2, "tasks": ["1.3", "2.2", "2.3", "2.4", "3.1", "4.2", "4.3"] },
    { "id": 3, "tasks": ["3.2", "3.3", "6.1"] },
    { "id": 4, "tasks": ["6.2", "7.1"] },
    { "id": 5, "tasks": ["7.2", "8.1"] },
    { "id": 6, "tasks": ["7.3", "7.4", "8.2"] }
  ]
}
```
