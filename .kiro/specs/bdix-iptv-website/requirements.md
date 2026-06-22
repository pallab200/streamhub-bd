# Requirements Document

## Introduction

A website that fetches an M3U playlist from a remote GitHub repository, validates which channels are currently accessible, and displays only the working channels to the user. Each channel is presented with its name and logo. The website automatically reflects updates when the source playlist changes.

## Glossary

- **Playlist_Fetcher**: The component responsible for retrieving the M3U playlist file from the remote source URL
- **Channel_Validator**: The component responsible for checking whether each channel stream URL is accessible and responding
- **Channel_Display**: The front-end component that renders working channels to the user
- **M3U_Parser**: The component responsible for parsing the M3U playlist format into structured channel data
- **Channel**: A single entry in the M3U playlist consisting of a name, logo URL, and stream URL
- **Working_Channel**: A channel whose stream URL responds successfully when probed
- **Source_URL**: The remote URL from which the M3U playlist is fetched (https://github.com/abusaeeidx/Mrgify-BDIX-IPTV/raw/main/playlist.m3u)

## Requirements

### Requirement 1: Fetch M3U Playlist

**User Story:** As a user, I want the system to fetch the latest M3U playlist from the source repository, so that I always see the most up-to-date channel list.

#### Acceptance Criteria

1. WHEN the website is loaded, THE Playlist_Fetcher SHALL retrieve the M3U playlist file from the Source_URL within 15 seconds
2. IF the Source_URL is unreachable due to network failure, DNS resolution failure, request timeout exceeding 15 seconds, or HTTP error response (status 400 or above), THEN THE Playlist_Fetcher SHALL display an error message indicating the playlist could not be loaded and provide a retry option
3. WHEN the playlist is successfully fetched, THE Playlist_Fetcher SHALL pass the raw playlist content to the M3U_Parser
4. WHEN the user activates the retry option, THE Playlist_Fetcher SHALL re-attempt to retrieve the M3U playlist file from the Source_URL

### Requirement 2: Parse M3U Playlist

**User Story:** As a developer, I want the M3U file to be parsed into structured channel data, so that each channel's metadata can be used for validation and display.

#### Acceptance Criteria

1. WHEN raw M3U content is received, THE M3U_Parser SHALL extract the channel name, logo URL, and stream URL for each entry by reading the `#EXTINF` directive line for name and `tvg-logo` attribute, and the immediately following non-empty line as the stream URL
2. THE M3U_Parser SHALL recognize content as valid M3U format when it begins with the `#EXTM3U` header and contains one or more `#EXTINF` directives each followed by a stream URL line
3. IF the M3U content does not begin with an `#EXTM3U` header or contains no parseable entries, THEN THE M3U_Parser SHALL return an empty channel list and log a warning
4. THE M3U_Parser SHALL produce Channel objects where parsing then serializing then re-parsing yields structurally equal objects with identical name, logo URL, and stream URL values
5. IF an `#EXTINF` directive is missing the `tvg-logo` attribute, THEN THE M3U_Parser SHALL set the logo URL to an empty string and still include the channel in the parsed list
6. IF an `#EXTINF` directive is not followed by a non-empty stream URL line, THEN THE M3U_Parser SHALL skip that entry and not include it in the parsed channel list

### Requirement 3: Validate Channel Availability

**User Story:** As a user, I want only working channels to be shown, so that I do not waste time clicking on broken streams.

#### Acceptance Criteria

1. WHEN the M3U_Parser produces a list of channels, THE Channel_Validator SHALL probe each channel stream URL by issuing an HTTP HEAD request (following up to 5 redirects) to determine accessibility
2. WHEN a channel stream URL returns an HTTP response with status 200-299 within 10 seconds (including redirect time), THE Channel_Validator SHALL classify that channel as a Working_Channel
3. IF a channel stream URL does not respond within 10 seconds, THEN THE Channel_Validator SHALL classify it as non-working
4. IF a channel stream URL returns an HTTP error status (400 or above), THEN THE Channel_Validator SHALL classify it as non-working
5. IF a channel stream URL fails due to a connection error (including DNS resolution failure, connection refused, or network unreachable), THEN THE Channel_Validator SHALL classify it as non-working
6. THE Channel_Validator SHALL process channel validations concurrently with a maximum of 20 simultaneous requests
7. WHEN all channel validations complete, THE Channel_Validator SHALL pass the list of Working_Channels to the Channel_Display

### Requirement 4: Display Working Channels

**User Story:** As a user, I want to see all working channels displayed with their name and logo, so that I can easily browse and select a channel to watch.

#### Acceptance Criteria

1. THE Channel_Display SHALL render only channels classified as Working_Channel
2. THE Channel_Display SHALL show the channel name for each Working_Channel, truncating names longer than 50 characters with an ellipsis
3. THE Channel_Display SHALL show the channel logo image for each Working_Channel
4. IF a channel logo URL fails to load, THEN THE Channel_Display SHALL display a placeholder image with the channel name
5. WHEN a user clicks on a Working_Channel, THE Channel_Display SHALL navigate the user to the stream URL in a new browser tab for playback
6. THE Channel_Display SHALL present channels in a responsive grid layout displaying a minimum of 2 columns on viewports 480px and wider, and a single column below 480px
7. IF zero Working_Channels are available after validation completes, THEN THE Channel_Display SHALL show a message indicating that no working channels were found

### Requirement 5: Automatic Updates from Source

**User Story:** As a user, I want the website to automatically reflect updates when the source playlist changes, so that I always see the latest available channels without manual intervention.

#### Acceptance Criteria

1. THE Playlist_Fetcher SHALL periodically re-fetch the M3U playlist from the Source_URL at a configurable interval (default: 30 minutes, minimum: 5 minutes, maximum: 24 hours)
2. WHEN a re-fetch returns playlist content that differs from the currently held playlist, THE Channel_Validator SHALL re-validate all channels from the updated playlist
3. WHEN validation completes after a re-fetch, THE Channel_Display SHALL update the displayed channels within 2 seconds without requiring a full page reload (the page shall not navigate away or visibly flash)
4. THE Playlist_Fetcher SHALL append a unique query parameter to each request to the Source_URL to prevent serving cached content
5. IF a periodic re-fetch fails due to network error or non-2xx HTTP response, THEN THE Playlist_Fetcher SHALL retain the current channel list unchanged and attempt the next re-fetch at the next scheduled interval

### Requirement 6: Loading and Status Indicators

**User Story:** As a user, I want to see loading progress and status information, so that I know the system is working while channels are being validated.

#### Acceptance Criteria

1. WHILE the Playlist_Fetcher is retrieving the playlist, THE Channel_Display SHALL show a loading indicator and hide any previously displayed channel content
2. WHEN the Playlist_Fetcher completes and the Channel_Validator begins validation, THE Channel_Display SHALL replace the loading indicator with a progress indicator showing the number of validated channels out of the total channel count (e.g., "X of Y channels validated")
3. WHILE the Channel_Validator is validating channels, THE Channel_Display SHALL update the progress indicator in real time as each channel validation completes
4. WHEN validation completes, THE Channel_Display SHALL replace the progress indicator with a summary showing the total number of working channels found
5. IF the Playlist_Fetcher or Channel_Validator encounters an error during loading or validation, THEN THE Channel_Display SHALL remove the loading or progress indicator and display an error message indicating the failure
6. WHILE a periodic re-fetch is in progress (per Requirement 5), THE Channel_Display SHALL show the progress indicator without removing the currently displayed working channels
