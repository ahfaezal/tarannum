# Tarannum.ai Decision Log

Version: 1.0  
Date: 2026-06-26  
Last Updated: 2026-06-26

## Purpose

This log records approved architecture decisions for Tarannum.ai.

Each decision should be treated as part of the project's Single Source of Truth until superseded by a later approved decision.

## Decision 001

Title: Reference Audio is the Single Source of Truth.

Status: Approved.

Date: 2026-06-26

Reference Audio is the authoritative source for Practice Live timing and rendering behaviour.

## Decision 002

Title: Practice Live uses Reference Timeline.

Status: Approved.

Date: 2026-06-26

Practice Live uses the Reference Timeline as the official time axis for the training session.

## Decision 003

Title: Reference Playhead remains centered after entering the Follow Zone.

Status: Approved.

Date: 2026-06-26

After entering the Follow Zone, the Reference Playhead remains visually centered in the graph and the graph moves beneath it.

## Decision 004

Title: Student Pitch Overlay is plotted using Reference Timeline during Practice Live.

Status: Approved.

Date: 2026-06-26

Student Pitch Overlay does not define its own timeline during Practice Live. It is plotted against the Reference Timeline.

## Decision 005

Title: Practice Live and Recording Analysis are separate rendering modes.

Status: Approved.

Date: 2026-06-26

Practice Live and Recording Analysis may share visual components, but they are distinct rendering modes with different purposes and timing rules.

