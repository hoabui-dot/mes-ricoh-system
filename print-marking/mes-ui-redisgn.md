# TASK

Perform a complete UX/UI redesign of the MES Platform.

Do NOT simply restyle existing pages.

Instead, redesign the entire application as a modern **Manufacturing Command Center** similar to enterprise manufacturing systems such as:

- Siemens Opcenter
- Rockwell FactoryTalk
- ABB Ability
- GE Digital Proficy
- Ignition SCADA
- SAP Digital Manufacturing
- Dassault DELMIA Apriso

The objective is to transform the current CRUD-style admin application into an industrial manufacturing operation platform.

Before implementation, analyze:

- README.md
- Product Documentation
- AI Documentation
- Architecture Documentation
- Existing React codebase
- Backend APIs
- Existing Station Agent
- Existing Kiosk UI
- Existing Device Simulator

The new MES UI must feel like the central control room of an entire factory.

------------------------------------------------------------

# Overall Design Philosophy

The current UI is page-centric.

Transform it into an operation-centric interface.

The application should prioritize:

Realtime visibility

Factory monitoring

Production execution

Decision making

Minimal navigation depth

Operational efficiency

Situational awareness

The UI should answer immediately:

"What is happening in the factory right now?"

instead of

"What data is stored in the system?"

------------------------------------------------------------

# Information Architecture

Redesign the application around business domains instead of database entities.

Top navigation should become:

Dashboard

Production

Planning

Workforce

Factory

Quality

Warehouse

Analytics

Administration

instead of exposing raw CRUD modules.

Every page should provide operational context.

------------------------------------------------------------

# Dashboard

The Dashboard becomes the Manufacturing Command Center.

It is no longer a collection of cards.

It should contain multiple realtime operational zones.

------------------------------------------------------------

Zone 1

Factory Overview

Display:

Plants

Areas

Production Lines

Stations

Current Shift

Current Production Orders

Running Work Orders

Workers Online

Equipment Health

Overall Equipment Effectiveness (future)

Realtime counters

------------------------------------------------------------

Zone 2

Production Monitoring

Large interactive table.

Columns:

Production Order

Product

Line

Assigned Workers

Current Operation

Progress

Target

Completed

Remaining

Delay

Current Status

Health

Clicking one row opens a right-side panel.

Never navigate away.

------------------------------------------------------------

Zone 3

Realtime Events

Timeline similar to an operation log.

Show:

Worker Assigned

Order Released

Assignment Override

Machine Offline

Shift Started

Shift Ended

Worker Leave

Notification

Alarm

Audit

Each event contains:

Time

Icon

Severity

User

Correlation ID

Expandable details

------------------------------------------------------------

Zone 4

Factory Status

Display factory topology.

Plant

↓

Area

↓

Line

↓

Station

Each node shows:

Online

Offline

Warning

Critical

Current Job

Worker Count

Health

Future Station Agent integration ready.

------------------------------------------------------------

Zone 5

Analytics

Live charts.

Production Rate

Assignment Score

Worker Utilization

Shift Capacity

Skill Distribution

Production Trend

Realtime updates through SSE.

------------------------------------------------------------

# Workforce Module

Transform into an HR + Factory Workforce application.

Workers should not appear as simple rows.

Provide:

Worker Card

Skill Matrix

Current Shift

Current Assignment

Availability

Certifications

Department

Experience

Recent Activities

Assignment History

Performance Metrics

Use avatar cards.

------------------------------------------------------------

# Planning Module

Planning should look like manufacturing scheduling software.

Primary view:

Monthly Calendar

Weekly Timeline

Shift Planner

Drag-and-drop assignments.

Visual conflict detection.

Highlight:

Missing workers

Skill mismatch

Leave conflicts

Overtime

Supervisor shortages

------------------------------------------------------------

# Production Module

Production Orders become the core operational screen.

Provide:

Master-Detail layout.

Left:

Production Orders

Right:

Order Detail

Timeline

Routing

Assigned Workers

Current Progress

Audit

Assignment

Events

Never open unnecessary pages.

------------------------------------------------------------

# Assignment Module

This module should visualize the Assignment Engine.

Display:

Suggested Workers

Suitability Score

Skill Match

Availability

Certificates

Priority

Explain WHY each worker was selected.

Managers must understand AI decisions.

Manual Override must create a revision timeline.

------------------------------------------------------------

# Factory Module

Create a completely new module.

Factory

↓

Areas

↓

Production Lines

↓

Stations

Future-proof for Station Agent integration.

Display topology visually.

Support tree navigation.

------------------------------------------------------------

# Quality Module

Create quality dashboards.

Inspection Result

Defect Types

Failure Trend

Yield

Pass Rate

Reject Rate

Quality Timeline

Future Vision integration ready.

------------------------------------------------------------

# Warehouse Module

Inventory

Material

Finished Goods

Inbound

Outbound

Reservation

Stock Health

Provide warehouse KPIs.

------------------------------------------------------------

# Analytics Module

Business Intelligence style.

Charts.

Pivot tables.

Filters.

Export.

Trend analysis.

Historical comparison.

------------------------------------------------------------

# Administration

System Settings

Permissions

Users

Audit

Notifications

SMTP

RabbitMQ

Redis

Feature Flags

API Keys

Integrations

------------------------------------------------------------

# Visual Style

Current design resembles a generic admin panel.

Replace with an industrial design language.

Characteristics:

Large whitespace

Comfortable spacing

Rounded corners

Soft shadows

Industrial typography

Clear hierarchy

Professional appearance

Minimal visual noise

Use color only for meaning.

------------------------------------------------------------

# Color System

Primary

Industrial Orange

Secondary

Dark Gray

Background

Light Gray

Cards

White

Success

Green

Warning

Orange

Error

Red

Information

Blue

Avoid excessive gradients.

Avoid neon colors.

------------------------------------------------------------

# Status System

Replace plain text with standardized badges.

Examples:

Online

Offline

Running

Waiting

Completed

Blocked

Delayed

Critical

Maintenance

Each status has:

Color

Icon

Tooltip

Description

------------------------------------------------------------

# Tables

Every large table must support:

Pagination

Filtering

Column Visibility

Grouping

Sorting

Sticky Header

Resizable Columns

CSV Export

Search

Saved Views

Density

Bulk Actions

------------------------------------------------------------

# Navigation

Collapsible Sidebar.

Global Search.

Breadcrumb.

Favorite Pages.

Recent Pages.

Notification Center.

Command Palette.

------------------------------------------------------------

# Realtime UX

Integrate Server-Sent Events throughout the application.

Realtime updates should animate smoothly.

Highlight changed rows.

Flash updated values briefly.

Reconnect automatically.

Show connection health.

------------------------------------------------------------

# Responsive Behavior

Desktop-first.

Support:

1920px

1600px

1440px

1280px

Tablets

Minimum supported width:

1280px.

------------------------------------------------------------

# Component Library

Build reusable enterprise components.

Examples:

Dashboard Card

KPI Card

Realtime Timeline

Factory Tree

Assignment Card

Worker Card

Production Card

Status Badge

Health Indicator

Progress Timeline

Property Panel

Master Detail Layout

Filter Toolbar

Statistics Panel

Empty State

Loading State

Permission Guard

------------------------------------------------------------

# Design System

Create a full design system.

Document:

Spacing

Typography

Color Tokens

Icons

Status Rules

Component Variants

Accessibility

Interaction Patterns

Motion Guidelines

------------------------------------------------------------

# Animations

Use Framer Motion subtly.

Never distract operators.

Animations should communicate state changes.

------------------------------------------------------------

# Documentation

After redesigning the application, update:

README.md

AI_DOCUMENT.md

DESIGN_SYSTEM.md

COMPONENT_GUIDE.md

UX_GUIDELINES.md

Every module README.

Explain the rationale behind each UX decision.

------------------------------------------------------------

# IMPORTANT

Do NOT redesign everything randomly.

Every screen must improve manufacturing operations.

Every interaction must reduce operator workload.

Every page must answer operational questions faster than before.

The final application should resemble a professional Manufacturing Execution System rather than a standard business admin dashboard.