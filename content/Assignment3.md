---
title: "Assignment 3"
slug: assignment3
date: 2025-04-01
math: true
---

# Assignment 3
# Hermes Research Workbench: Setup Summary

## 1. Overview

Hermes Research Workbench was built as a local academic research environment for managing papers, reading them with source-grounded AI assistance, and turning a literature library into usable writing material.

The original goal was not simply to create a PDF viewer. The aim was to build a practical research workflow around Hermes:

```text
PDF papers
→ extracted text and metadata
→ searchable paper chunks
→ grounded notes and Q&A
→ literature review drafts
→ paper draft / citation export
→ /raw → /citation-auditor → /latex-pf
```

The final system combines a command-line tool, a local database, a Hermes skill, and a Streamlit-based web interface. It is currently deployed on the Hermes machine referred to as **Pro**.

---

## 2. Environment and Main Locations

The system runs under the `lhx` user on Pro.

Main workspace:

```bash
~/research-workbench
```

Hermes skill location:

```bash
~/.hermes/skills/research-workbench
```

Main commands:

```bash
rw
rw-ui
rw-backup
rw-doctor
```

Web UI address on Pro:

```text
http://localhost:8501
```

When accessing from the Mac through an SSH tunnel:

```bash
ssh -N -L 8502:127.0.0.1:8501 pro
```

Then open:

```text
http://localhost:8502
```

---

## 3. System Design

The workbench is built around four layers.

### Literature storage

Original PDFs, extracted Markdown, notes, exports, temporary uploads, and generated writing packs are stored under `~/research-workbench`.

### Local database

A SQLite database stores paper records, metadata, chunks, note paths, and reading status. This keeps the project lightweight and easy to back up.

### Research command-line tool

The `rw` command handles paper import, metadata editing, retrieval, note generation, literature review generation, citation export, and maintenance tasks.

### Web interface

The Streamlit frontend provides a dashboard-style interface with three main areas:

```text
Left:   Literature Library
Center: Selected Paper / Snapshot / Notes / Metadata
Right:  AI Assistant / Literature Review / Writing Workflow / Upload
```

The final layout was redesigned to reduce empty space and make the middle panel more useful. It now includes structured reading cards, source previews, recent note previews, metadata editing, file paths, and safe deletion.

---

## 4. Core Build Process

The project started from an MVP package containing a Hermes skill, a Python CLI, and a simple Streamlit UI.

After installation, the first issue was that the `rw` command was written into `.bashrc`, while the active shell was `zsh`. This was fixed by creating a direct wrapper in `~/.local/bin/rw`, pointing to the Python CLI inside the Hermes skill directory.

Once the command-line tool was available, the first PDF was imported successfully. The system extracted the title, author, year, DOI, and text chunks. This confirmed that the basic pipeline was working:

```text
PDF → text extraction → Markdown → chunks → SQLite → retrieval
```

After the first test succeeded, a batch import was run on the ADS-B paper folder. Very small PDF files were skipped because they were likely failed downloads or placeholder files.

The web UI was then installed and connected to the same database. The first UI version confirmed that the library, selected-paper view, and evidence retrieval could be displayed in a browser.

---

## 5. Functional Evolution

The tool was expanded in several practical stages rather than designed all at once.

### Paper import and retrieval

The first working version supported:

```bash
rw add
rw list
rw show
rw retrieve
rw snapshot-context
```

This gave the system a usable local paper library and allowed source chunks to be retrieved for a selected paper.

### Numeric paper IDs

The original paper IDs were long slug strings. To make daily use easier, numeric selection was added:

```bash
rw show --paper-id 1
rw note --paper-id 1
rw answer --paper-id 1
```

This made the tool much easier to use from both the terminal and the web UI.

### Structured notes

The `rw note` command was added to generate source-grounded structured notes. Each note includes the paper’s core claim, evidence, method, limitations, relevance to ADS-B research, and source chunks used.

Notes are saved in:

```bash
~/research-workbench/notes
```

### Grounded Q&A

The `rw answer` command was added after configuring an LLM endpoint in:

```bash
~/research-workbench/.env
```

The answer workflow retrieves source chunks first, then asks the LLM to answer only from those chunks. The answer is saved as a note and shown in the web UI.

This changed the right panel from a simple retriever into a usable research assistant.

### Literature review generation

The `rw review` command was added to generate literature review drafts from multiple papers matching selected tags, such as:

```bash
ADS-B,trajectory
```

The output is saved under:

```bash
~/research-workbench/exports
```

### Course paper draft generation

The `rw paper-draft` command was added to turn a set of papers into a course-paper style draft. It produces sections such as abstract, introduction, literature review, method design, discussion, conclusion, and reference placeholders.

This is not treated as a final paper. It is a grounded first draft that can be revised through the existing Hermes writing workflow.

### Writing workflow pack

The `rw workflow-pack` command was added to connect the research tool with the existing writing tools:

```text
Research Workbench
→ paper-draft
→ workflow-pack
→ /raw
→ /citation-auditor
→ /latex-pf
```

A workflow pack contains the cleaned draft, citation map, BibTeX file, and prompts for the later Hermes skills.

### Citation export

Both BibTeX and APA export were added.

BibTeX is useful for LaTeX:

```bash
rw bibtex --tags "ADS-B,trajectory"
```

APA is useful for direct copying into reports or presentations:

```bash
rw apa --paper-id 1
rw apa --tags "ADS-B,trajectory"
```

Since citation quality depends on metadata quality, the metadata editor became an important part of the system.

---

## 6. Frontend Design

The frontend was redesigned after the initial UI looked too empty and mechanical.

The final page is closer to a research dashboard:

- Left column: searchable literature library, filters, paper list
- Middle column: selected paper card, snapshot, structured reading cards, source preview, notes, metadata, files
- Right column: AI assistant, literature review, paper draft, workflow pack, APA/BibTeX export, PDF upload

The middle column was specifically improved because the first version had too much blank space. It now shows:

- Paper Snapshot
- Research type, domain, method, focus
- Structured Reading Cards
- Source Preview
- Recent Note Preview

This made the page feel more like a real research workspace rather than a thin wrapper around terminal commands.

---

## 7. Library Maintenance

Several maintenance functions were added after real use exposed common problems.

### Metadata editing

PDF metadata is often unreliable. The system now supports editing title, authors, year, DOI, tags, status, and starred state from both CLI and UI.

```bash
rw edit-meta --paper-id 1 --year 2025 --tags "ADS-B,trajectory"
```

### Duplicate detection

Repeated imports created duplicate entries. The system now detects duplicates using SHA256, DOI, and normalized title-year matching.

```bash
rw duplicates
```

Duplicate papers can be safely deleted:

```bash
rw delete-paper --paper-id "paper_id" --yes
```

Files are moved to a trash folder rather than being permanently removed.

### Orphan cleanup

If files exist on disk but are no longer referenced in the database, they can be reviewed and moved to trash:

```bash
rw cleanup-orphans
rw cleanup-orphans --yes
```

---

## 8. Stable Operation

The UI was turned into a long-running local service using a macOS LaunchAgent:

```bash
~/Library/LaunchAgents/com.lhx.research-workbench.ui.plist
```

The service runs `rw-ui` on `127.0.0.1:8501`.

Two helper commands were also created.

Backup:

```bash
rw-backup
```

Health check:

```bash
rw-doctor
```

The backup command saves the database, papers, Markdown files, notes, exports, and Hermes skill files. The doctor command checks the command paths, database, paper count, note count, Streamlit process, port status, LaunchAgent status, and recent logs.

---

## 9. Current Capabilities

The current version supports:

- PDF import
- Batch import
- Web PDF upload
- Text extraction and chunking
- Local paper database
- Search and filtering
- Reading status
- Starred papers
- Metadata editing
- Duplicate detection
- Safe deletion
- Orphan cleanup
- Source-grounded notes
- Source-grounded paper Q&A
- Evidence-only retrieval
- Literature review generation
- Course paper draft generation
- Writing workflow pack export
- BibTeX export
- APA export
- Web dashboard
- Backup and health check
- Mac access through SSH tunnel

---

## 10. Typical Workflow

A normal research workflow now looks like this:

```text
1. Upload or import PDFs.
2. Check and correct metadata.
3. Generate structured notes for important papers.
4. Ask grounded questions about individual papers.
5. Generate a literature review from selected tags.
6. Generate a course-paper draft if needed.
7. Export BibTeX or APA references.
8. Build a workflow pack for /raw, /citation-auditor, and /latex-pf.
9. Continue polishing the paper through the Hermes writing workflow.
```

The tool is most useful when treated as a source-grounded reading and writing assistant, not as a fully automatic paper writer. The important design rule is that every generated claim should trace back to a paper chunk, metadata record, or user-edited note.

---

## 11. Remaining Improvements

The current system is already usable, but several improvements would make it stronger:

- Zotero synchronization
- Crossref or OpenAlex metadata enrichment
- Better APA formatting for complex author names
- Vector retrieval instead of keyword-only retrieval
- OCR support for scanned PDFs
- Direct DOCX export
- Deeper integration with `/raw`, `/citation-auditor`, and `/latex-pf`
- Better citation verification before final paper generation

---

## 12. Summary

Hermes Research Workbench has been developed from a simple PDF import tool into a local academic research platform.

It now covers the complete path from literature collection to grounded reading, review generation, draft writing, citation export, and integration with the existing Hermes writing workflow.

The most important result is not the frontend itself, but the workflow behind it: papers are stored locally, claims are generated from retrieved evidence, citations can be exported, and writing materials can be handed off to the existing paper-production pipeline.
