# Smile Smart Homes

## Project Overview

Smile Smart Homes is a premium, high-performance web application designed to act as both a public-facing brochure and a powerful internal business management tool. Built on a modern technology stack utilizing Astro for lightning-fast page routing and React for highly interactive user interfaces, the platform seamlessly bridges the gap between client acquisition and internal lead management. 

The application features secure authentication using Firebase, an incredibly dynamic "Smart Home Planner" that funnels direct leads into the database, and a robust Admin Dashboard where staff can immediately manage client requests, view performance analytics, and schedule hardware installations. By migrating traditional business operations—such as quoting, system diagnostics, and pipeline tracking—directly into the web interface, Smile Smart Homes operates as a standalone, enterprise-grade Customer Relationship Management (CRM) tool. It empowers the team to scale operations, impress high-end clientele with a premium aesthetic, and maintain strict data security without relying on fragmented third-party software.

## Suggestions for this Website

Over the course of the project audit, we successfully designed, prototyped, and archived three major enterprise-grade feature enhancements to significantly upgrade both the administrative experience and public engagement:

### 1. Admin Dashboard Visual Overhaul
We designed a complete modernization of the primary Admin Analytics Dashboard. This enhancement introduces a glassy, macOS-inspired UI aesthetic with floating KPI metric cards that highlight total quotes, active users, and pending tickets. Furthermore, it incorporates data visualization to render responsive, dynamic area charts mapping daily contact submissions, and revamps the standard "Recent Users" list by generating visual user avatars alongside premium active/inactive status badges.

### 2. Drag-and-Drop CRM Kanban Pipeline
To transform the "Plan Leads" data from a static table into a fully functional sales management tool, we built a native HTML5 Drag-and-Drop Kanban board. This feature allows administrators to literally pick up a customer lead card and physically drag it through sequential sales columns (from "New Lead" to "Contacted", "Quote Sent", and finally "Install Scheduled"). The system was wired to automatically ping the Firebase backend upon every drop, instantly securing the updated pipeline status.

### 3. Interactive Floorplan Tour
To maximize user engagement on the public landing page, we engineered a scalable, responsive architectural blueprint. Across this blueprint, animated glowing "hotspots" hover over key rooms (Living Room, Kitchen, Front Door, Garage, Bedroom). When a prospective customer clicks a specific hotspot, a premium frosted-glass panel elegantly slides onto the screen, detailing the exact hardware and automated routines Smile Smart Homes can install in that specific space.

## Optional Suggestion

### Interactive Cost Estimator
As a powerful alternative to the standard text-based contact form, we developed a standalone, high-fidelity **Interactive Cost Estimator** prototype. This feature replaces traditional quoting methods with a modern, dynamic calculator. Prospective clients are guided through a visually rich selection process—toggling switches for "Smart Lighting," "Security Cameras," and "Climate Control". As they select features, a sleek, floating summary box instantly calculates and outputs a live budget estimate. This creates a highly transparent, gamified experience that drastically increases the likelihood of a user volunteering their contact information, as they feel they are actively designing their own package rather than blindly submitting an email address.
