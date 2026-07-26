# TASK

Build a complete Enterprise Manufacturing Execution System (MES) Frontend.

Before writing any code, analyze the entire repository first.

Read and understand:

- README.md
- docs/
- AI documentation
- Product documentation
- Architecture documentation
- API Style Guide
- RabbitMQ documentation
- Event documentation
- Database documentation

Do not guess business logic.

Everything must follow the backend implementation exactly.

The frontend must become the official web application for the MES Platform.

------------------------------------------------------------------

# Tech Stack

React 19

TypeScript

Vite

TailwindCSS

shadcn/ui

TanStack Query

TanStack Router

React Hook Form

Zod

Zustand

Axios

Recharts

Framer Motion

Lucide Icons

React Table (TanStack Table)

date-fns

React Day Picker

React Flow (for workflow visualization)

Monaco Editor (for JSON viewer where appropriate)

------------------------------------------------------------------

# UI Theme

Company primary colors

Orange

Red

White

Gray

The application should look modern industrial software.

Reference style:

Siemens Opcenter

Rockwell FactoryTalk

ABB Manufacturing

Ignition SCADA

Azure Portal

Linear

Do NOT use a generic admin template.

------------------------------------------------------------------

# UI Principles

The target users are:

Factory Managers

Production Managers

Shift Supervisors

Operators

HR Personnel

System Administrators

UX must prioritize:

Fast navigation

Large tables

Keyboard friendly

Minimal clicks

Responsive layout

Large touch targets

Readable typography

Status colors

Realtime updates

Professional appearance

------------------------------------------------------------------

# Folder Structure

Create:

src/

app/

layouts/

pages/

modules/

components/

hooks/

services/

stores/

types/

utils/

providers/

routes/

assets/

Each module owns:

components/

pages/

api/

hooks/

schemas/

types/

README.md

------------------------------------------------------------------

# Layout

Implement:

Authentication Layout

Dashboard Layout

Fullscreen Layout

Settings Layout

404

403

Loading Layout

Each layout must be reusable.

------------------------------------------------------------------

# Authentication

JWT Login

Refresh Token

Remember Login

Auto Refresh

Permission Guard

Route Guard

Profile

Change Password

Session Expired Dialog

------------------------------------------------------------------

# RBAC

Frontend RBAC must exactly follow backend permissions.

Never hardcode permissions.

Permission example:

Worker.View

Worker.Create

Worker.Update

Worker.Delete

Planning.Publish

Assignment.Override

Dashboard.View

Audit.View

Menus

Buttons

Tabs

Dialogs

Actions

must automatically hide or disable based on permissions.

------------------------------------------------------------------

# Navigation

Sidebar

Breadcrumb

Command Palette

Search

Favorites

Notifications

Profile Menu

Dark Mode

Language Switch

------------------------------------------------------------------

# Dashboard

Build a real manufacturing dashboard.

Cards:

Workers Online

Workers Available

Current Shift

Production Orders

Running Orders

Delayed Orders

Assignment Score

Skill Distribution

Notifications

Realtime System Status

Charts:

Production Trend

Shift Utilization

Assignment Efficiency

Worker Availability

Department Distribution

Realtime updates using Server-Sent Events.

------------------------------------------------------------------

# Identity Module

Pages

Login

Users

Roles

Permissions

Profile

Sessions

Reset Password

Audit History

Tables

Filters

Dialogs

Bulk Actions

------------------------------------------------------------------

# Workforce Module

Pages

Workers

Departments

Teams

Workshops

Skills

Certifications

Worker Availability

Worker Detail

Skill Matrix

Calendar

Features

Advanced Search

Filters

Bulk Import

Bulk Export

Avatar

Status Badge

------------------------------------------------------------------

# Planning Module

Pages

Shift Templates

Monthly Calendar

Worker Assignment

Team Assignment

Leave Requests

Overtime Requests

Calendar View

Timeline View

Drag and Drop

Conflict Detection

------------------------------------------------------------------

# Production Module

Pages

Production Orders

Work Orders

Routing Templates

Routing Operations

Order Detail

Lifecycle Timeline

Progress

Assignment

Status History

------------------------------------------------------------------

# Assignment Module

Pages

Suggested Assignments

Assignment Detail

Worker Score

Override Assignment

Revision History

Every manual override must show:

Previous Assignment

New Assignment

Score

Reason

Approval

Audit

Never overwrite history.

------------------------------------------------------------------

# Dashboard Projection

Use SSE.

Implement:

Reconnect

Heartbeat

Offline Banner

Loading State

Realtime cards

Realtime tables

Realtime charts

------------------------------------------------------------------

# Notifications

Notification Center

Unread Counter

Toast

History

Mark Read

Read All

Realtime updates

------------------------------------------------------------------

# Audit Module

Pages

Audit Timeline

Entity Changes

Diff Viewer

Trace Detail

Correlation Detail

Filters

JSON Viewer

------------------------------------------------------------------

# Tables

Use TanStack Table.

Support

Pagination

Sorting

Filtering

Column Visibility

Column Resize

Sticky Header

CSV Export

Search

Density

Row Selection

Bulk Actions

Persist user preferences.

------------------------------------------------------------------

# Forms

React Hook Form

Zod

Autosave where appropriate.

Inline validation.

Optimistic UI.

------------------------------------------------------------------

# API Layer

Axios

Typed SDK

Request Interceptors

Response Interceptors

Retry

401 Refresh

Error Mapping

Never call fetch directly.

------------------------------------------------------------------

# State Management

TanStack Query

Server State

Zustand

UI State

No Redux.

------------------------------------------------------------------

# Error Handling

Global Error Boundary

Network Banner

Retry Button

Permission Errors

Validation Errors

Toast Messages

------------------------------------------------------------------

# Loading UX

Skeleton

Progress Bar

Lazy Loading

Suspense

Optimistic Rendering

------------------------------------------------------------------

# Industrial Status Components

Create reusable components:

StatusBadge

ConnectionBadge

WorkerStatus

AssignmentStatus

ProductionStatus

ShiftStatus

HealthIndicator

SignalIndicator

RealtimeDot

------------------------------------------------------------------

# Common Components

DataTable

PageHeader

PageToolbar

SearchBar

EntityDialog

DeleteDialog

ConfirmDialog

SidePanel

Timeline

ActivityFeed

PropertyGrid

StatisticCard

ChartCard

FilterBar

Toolbar

PermissionGuard

------------------------------------------------------------------

# Design System

Every component must be reusable.

Every component must include Storybook-ready examples.

Never duplicate UI.

------------------------------------------------------------------

# Performance

Route Splitting

Component Lazy Loading

Virtualized Tables

Memoization

Query Prefetch

Image Optimization

Code Splitting

------------------------------------------------------------------

# Accessibility

WCAG AA

Keyboard Navigation

Screen Reader Labels

Focus Management

ARIA

------------------------------------------------------------------

# Internationalization

English

Vietnamese

Language switch

All labels must use i18n keys.

------------------------------------------------------------------

# Testing

Implement:

Vitest

React Testing Library

Playwright

Component Tests

Integration Tests

Critical User Flow Tests

Coverage Reports

------------------------------------------------------------------

# Documentation

Generate:

README.md

AI_DOCUMENT.md

ARCHITECTURE.md

COMPONENT_GUIDE.md

DESIGN_SYSTEM.md

STATE_MANAGEMENT.md

API_GUIDE.md

ROUTING_GUIDE.md

PERMISSION_GUIDE.md

TESTING_GUIDE.md

PERFORMANCE_GUIDE.md

Each module must contain its own README.md explaining:

Purpose

Folder structure

Components

API

Hooks

Types

Business responsibility

Coding conventions

------------------------------------------------------------------

# IMPORTANT

Do NOT build everything at once.

Implement module by module.

Order:

Phase 1

Application Shell

Authentication

RBAC

Navigation

Theme

Shared Components

Phase 2

Identity Module

Phase 3

Workforce Module

Phase 4

Planning Module

Phase 5

Production Module

Phase 6

Assignment Module

Phase 7

Dashboard + SSE

Phase 8

Notification Center

Audit Module

Settings

Testing

Documentation

After each phase:

1. Build successfully.
2. Execute tests.
3. Fix lint issues.
4. Update documentation.
5. Update AI documentation.
6. Update README files.
7. Produce a Vietnamese progress report before continuing.

Never continue to the next phase until the previous one is fully completed.