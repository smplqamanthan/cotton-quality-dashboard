---
description: Repository Information Overview
alwaysApply: true
---

# Cotton Dashboard Information

## Summary
A React-based dashboard application for cotton quality management with a Node.js backend. The application allows users to view, filter, and export cotton lot results, manage pending lots, and generate summary reports.

## Structure
- **src/**: Frontend React application source code
- **public/**: Static assets for the React application
- **cotton-dashboard-backend/**: Express.js backend server
- **src/components/**: React components for the dashboard UI

## Language & Runtime
**Language**: JavaScript (React, Node.js)
**Version**: React 19.2.0, Node.js (ES Modules)
**Build System**: Create React App
**Package Manager**: npm

## Dependencies

### Frontend
**Main Dependencies**:
- react: ^19.2.0
- react-dom: ^19.2.0
- @supabase/supabase-js: ^2.74.0
- jspdf: ^3.0.3
- jspdf-autotable: ^5.0.2
- xlsx: ^0.18.5

**Development Dependencies**:
- tailwindcss: ^3.3.3
- autoprefixer: ^10.4.21
- postcss: ^8.5.6

### Backend
**Main Dependencies**:
- express: ^5.1.0
- @supabase/supabase-js: ^2.58.0
- cors: ^2.8.5
- dotenv: ^17.2.3
- multer: ^2.0.2

## Build & Installation

### Frontend
```bash
npm install
npm start  # Development server on port 3000
npm run build  # Production build
```

### Backend
```bash
cd cotton-dashboard-backend
npm install
npm start  # Server runs on port 5000
```

## Database
**Type**: Supabase (PostgreSQL)
**Tables**:
- lot_results: Stores cotton lot test results
- mixing_chart: Manages cotton mixing information
- mixing_issue: Tracks issue dates and details

## Features
- Cotton lot results viewing with filtering
- Excel and PDF export functionality
- Pending lots management with template download/upload
- Summary reports with weighted averages
- Responsive UI with Tailwind CSS styling

## Testing
**Framework**: Jest with React Testing Library
**Test Location**: src/App.test.js and other test files
**Run Command**:
```bash
npm test
```