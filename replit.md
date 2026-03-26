# Deriv Bot

## Overview

Deriv Bot is a web-based automated trading platform that allows users to create trading bots without coding. The application uses a visual block-based programming interface (powered by Blockly) to let users design trading strategies. Users can build bots from scratch, use quick strategies, or import existing bot configurations. The platform supports both demo and real trading accounts through the Deriv trading API.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Framework
- **React 18** with TypeScript as the primary UI framework
- **MobX** for state management across the application
- Stores are organized in `src/stores/` with a root store pattern that aggregates domain-specific stores (client, dashboard, chart, run-panel, etc.)

### Build System
- **Rsbuild** as the primary build tool (modern, fast bundler)
- Webpack configuration available as fallback
- Babel for transpilation with support for decorators and class properties

### Visual Programming
- **Blockly** library for the drag-and-drop bot building interface
- Custom blocks and toolbox configurations for trading-specific operations
- Workspace serialization for saving/loading bot strategies

### Trading Integration
- **@deriv/deriv-api** for WebSocket-based communication with Deriv trading servers
- Real-time market data streaming and order execution
- Support for multiple account types (demo, real, wallet-based)

### Authentication
- **API Token authentication** — users paste a Deriv API token directly in the navigation bar
- No OAuth/OIDC redirect flow; login is replaced with an inline token input in the header
- Connected account balance and type are displayed via the existing AccountSwitcher component
- Disconnect button in the header clears the token and logs out
- Token is stored in `localStorage` (authToken, active_loginid, accountsList, clientAccounts)
- `api_base.init(true)` is called after a token is stored to authorize and subscribe

### Charting
- **@deriv/deriv-charts** for displaying market data and trade visualizations
- Real-time chart updates during bot execution

### PWA Support
- Service worker for offline capabilities
- Installable as a Progressive Web App on mobile devices
- Offline fallback page

### Internationalization
- **@deriv-com/translations** for multi-language support
- CDN-based translation loading with Crowdin integration

### Analytics & Monitoring
- **RudderStack** for event tracking and analytics
- **Datadog** for session replay and performance monitoring
- **TrackJS** for error tracking in production

## External Dependencies

### Deriv Ecosystem Packages
- `@deriv-com/auth-client` - Authentication client
- `@deriv-com/analytics` - Analytics integration
- `@deriv-com/quill-ui` / `@deriv-com/quill-ui-next` - UI component library
- `@deriv-com/translations` - Internationalization
- `@deriv/deriv-api` - Trading API client
- `@deriv/deriv-charts` - Charting library

### Cloud Services
- **Cloudflare Pages** - Deployment platform
- **Google Drive API** - Bot strategy storage and sync
- **LiveChat** - Customer support integration
- **Intercom** - In-app messaging (feature-flagged)
- **GrowthBook** - Feature flag management
- **Survicate** - User surveys

### Third-Party Libraries
- `blockly` - Visual programming blocks
- `mobx` / `mobx-react-lite` - State management
- `react-router-dom` - Client-side routing
- `formik` - Form handling
- `@tanstack/react-query` - Server state management
- `js-cookie` - Cookie management
- `localforage` - Client-side storage
- `lz-string` / `pako` - Compression utilities

## Recent Changes

### API Token Authentication (March 2026)
- Replaced OAuth2/OIDC login and Sign up buttons with an inline API token connector in the navigation header
- New components: `src/components/layout/header/api-token-connector.tsx` and `api-token-disconnect.tsx`
- Removed `AuthLoadingWrapper` OAuth dependency and layout OIDC redirect logic
- Non-logged-in users see the full app immediately (bot builder, dashboard, etc.) and connect via their Deriv API token
- When connected, header shows the AccountSwitcher (balance + account type) and a Disconnect button
- All trading functionality (bot building, running, quick strategies, charts) works as before once connected

### Free Bots Feature (December 2025)
- Added Free Bots page with 12 pre-built trading bot templates
- Bot cards display with category filtering (Speed Trading, AI Trading, Pattern Analysis, etc.)
- Click-to-load functionality that imports bot XML into Bot Builder
- Responsive card design with hover effects and loading states
- Bot XML files stored in `/public/bots/` directory
- Files: `src/pages/free-bots/index.tsx`, `src/pages/free-bots/free-bots.scss`