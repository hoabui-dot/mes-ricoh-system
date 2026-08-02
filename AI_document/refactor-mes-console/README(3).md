# MES Console Remediation Prompt Package

This package contains the execution rules, report template, and Phase UI-00 through UI-10 prompts for the MES Console remediation program.

## Required execution order

1. `AI_document/REMEDIATION_MASTER_RULES.md`
2. `AI_document/Phase-00/PROMPT_PHASE_00.md`
3. `AI_document/Phase-01/PROMPT_PHASE_01.md`
4. `AI_document/Phase-02/PROMPT_PHASE_02.md`
5. `AI_document/Phase-03/PROMPT_PHASE_03.md`
6. `AI_document/Phase-04/PROMPT_PHASE_04.md`
7. `AI_document/Phase-05/PROMPT_PHASE_05.md`
8. `AI_document/Phase-06/PROMPT_PHASE_06.md`
9. `AI_document/Phase-07/PROMPT_PHASE_07.md`
10. `AI_document/Phase-08/PROMPT_PHASE_08.md`
11. `AI_document/Phase-09/PROMPT_PHASE_09.md`
12. `AI_document/Phase-10/PROMPT_PHASE_10.md`

Each phase must produce `AI_document/Phase-XX/REPORT_PHASE_XX.md` using `AI_document/REPORT_TEMPLATE.md`.

Do not execute multiple phases in one AI session unless explicitly authorized.
