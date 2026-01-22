# Changelog

All notable changes to PRISM will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (V9: Fact-Grounded AI)
- Source document traceability for compliance rules
- `calculation_audit_log` table for tracking which rules are applied
- Expiring rules alert in Admin Compliance Rules page
- Document hierarchy (Constitution > Act > Finance Act > Circular)
- Grounding notice in AI prompts - cites sources or says "I don't know"

### Added (V8: Code Proposals Enhancements)
- `codebase_registry` table with actual file paths for code proposals
- "Needs Revision" status for code proposals
- Source verification check before auto-apply

## [1.1.0] - 2026-01-17

### Added
- V9: Fact-Grounded AI - all rules must link to source documents
- V8: Codebase-aware code proposals with source verification
- V7: Multi-turn conversation support in Gateway
- V6: Admin bot messaging and user data clearing
- V5: Test mode and web-only registration
- V4: User subscription tiers with Paystack integration
- V3: API system with gateway, webhooks, and developer portal
- V2: Centralized shared utilities and tax-calculate edge function

### Changed
- AI prompts now require source citations
- Code proposals marked as ⚠️ UNVERIFIED if no source document
- Auto-apply disabled for unverified proposals

### Security
- Document-based rule traceability for audit compliance

## [1.0.0] - 2026-01-08

### Added
- Dynamic tax rules engine synchronized across all components
- Code change proposal system for regulatory updates
- Real-time profile-compliance sync triggers
- Comprehensive admin panel with collapsible sidebar
- Tax Calendar with database-driven deadlines
- Education Center with dynamic content
- NLU testing and VAT testing interfaces
- ML Health monitoring dashboard
- Pattern management for transaction classification
- Document processing skill with Nigerian bank support
- WhatsApp and Telegram chatbot integration
- Mono bank connection for transaction sync
- CBN exchange rate fetching service

### Changed
- Tax calculations now use compliance_rules table
- User profiles linked to dynamic tax categories
- Education articles sourced from database

### Fixed
- Reports.tsx VAT calculation syntax error
- RLS policies for admin-only tables

### Security
- RLS enabled on all new tables
- Admin-only access for compliance management

