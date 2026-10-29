# AI assisted infrastructure research

Reviewed 2026-10-29. Stable paper IDs06–10 match PDF filenames. Metadata, complete author lists, provenance, licenses, sizes, page counts and SHA256 values are in `ai-papers.json`. PDF page numbers below are physical PDF pages, including front matter, not viewer-dependent journal numbering. Files are unmodified source PDFs, not generated substitutes.

## What do the five papers implement and demonstrate?

### Takeaway

The closest literature already covers natural-language IaC generation, graph-based validation, verifier feedback, mutation, cloud SDK agents, and human supervision. CloudCanvas's defensible differentiation is its particular integrated graph-edit/review/deploy workflow, not invention of those constituent ideas. Schema acceptance, intent correctness, live deployability and security must be evaluated separately.

### Cited Findings

#### 06 — IaC-Eval

**Bibliography:** Patrick Tser Jern Kon et al., *IaC-Eval: A Code Generation Benchmark for Cloud Infrastructure-as-Code Programs*. NeurIPS2024 Datasets and Benchmarks Track. [Official proceedings and authors](https://papers.nips.cc/paper_files/paper/2024/hash/f26b29298ae8acd94bd7e839688e329b-Abstract-Datasets_and_Benchmarks_Track.html). Local PDF `06-iac-eval.pdf`,19 pages.

**Method and evidence:**458 expert-authored AWS/Terraform tasks pair natural-language requirements with Rego intent specifications. The evaluation first derives a speculative deployment graph using `terraform plan`, then checks user intent using OPA; it does not require actual deployment (PDF pp.3–4). Historical GPT-4 pass@1 is19.36%, Table1 (p.6). The gap between compilability and intent checks is the key result, not a prediction about present-day Groq/NVIDIA performance. Limitations include AWS/Terraform focus and omitted HCL function generation (pp.8–9). [Paper PDF](https://papers.nips.cc/paper_files/paper/2024/file/f26b29298ae8acd94bd7e839688e329b-Paper-Datasets_and_Benchmarks_Track.pdf).

**CloudCanvas inference:** Existing JSON Schema and attachment checks can reject malformed graphs, but do not establish that a prompt's desired infrastructure was produced. Adapt the benchmark's *method* to graph-specific requirement tests; CloudCanvas does not emit Terraform, so it cannot claim an IaC-Eval score without a documented adapter and evaluation.

#### 07 — Multi-IaC-Eval

**Bibliography:** Sam Davidson, Li Sun, Bhavana Bhasker, Laurent Callot, Anoop Deoras. *Multi-IaC-Eval: Benchmarking Cloud Infrastructure as Code Across Multiple Formats*,2025, arXiv2509.05303v1; peer-reviewed venue not verified. [Primary record](https://arxiv.org/abs/2509.05303). Local PDF `07-multi-iac-eval.pdf`,28 pages.

**Method and evidence:** Its Multi-IaC-Bench represents changes as initial template, natural-language edit, and expected template. Validation combines format linters, Checkov, an LLM semantic judge, and a60-sample human review (p.6). Experiments cover337 CloudFormation,171 Terraform and191 CDK templates; CDK handling converts through CloudFormation rather than testing unconstrained native repository edits (p.7). Retry-loop ablations improve lint/security-tool compliance (p.8). The authors explicitly exclude actual deployment testing and acknowledge enterprise-scale and native-CDK limitations (p.9). [Versioned PDF](https://arxiv.org/pdf/2509.05303v1).

**CloudCanvas inference:** Test edits for preservation of unaffected nodes and attributes, not merely graph validity. Current full-graph blueprint replacement is not a safe incremental mutation engine; a future graph-diff preview and mutation benchmark would address a different, presently unimplemented capability. High static pass rates are not evidence of production readiness.

#### 08 — TerraFormer

**Bibliography:** Prithwish Jana, Sam Davidson, Bhavana Bhasker, Andrey Kan, Anoop Deoras, Laurent Callot. *TerraFormer: Automated Infrastructure-as-Code with LLMs Fine-Tuned via Policy-Guided Verifier Feedback*. ICSE2026 SEIP; DOI10.1145/3786583.3786898. Downloaded author version arXiv2601.08734v1,12 pages. [Primary record](https://arxiv.org/abs/2601.08734); [conference entry](https://conf.researchr.org/details/icse-2026/icse-2026-software-engineering-in-practice/43/TerraFormer-Automated-Infrastructure-as-Code-with-LLMs-Fine-Tuned-via-Policy-Guided-).

**Method and evidence:** Terraform validation, speculative planning, and OPA/Rego feedback support dataset construction and supervised-plus-reinforcement fine-tuning (pp.3–6). Table2 reports31.44% IaC-Eval correctness for the14B SFT+RL variant versus15.50% for its base: **15.94 percentage points**, not a15.94% relative improvement (p.7). Correctness is relative to the encoded intent policy; security scores average passed Checkov checks per instance, not the proportion of entirely secure deployments (p.7). [Versioned PDF](https://arxiv.org/pdf/2601.08734v1).

**CloudCanvas inference:** A staged verifier pipeline with actionable feedback is a plausible improvement. Shared schemas and typed build parsing are much narrower than this policy-guided training/evaluation framework. CloudCanvas has no equivalent fine-tuning, policy verifier, published benchmark or proof of superior generation accuracy.

#### 09 — IaCGen and DPIaC-Eval

**Bibliography:** Tianyi Zhang, Shidong Pan, Zejun Zhang, Zhenchang Xing, Xiaoyu Sun. *Deployability-Centric Infrastructure-as-Code Generation: Fail, Learn, Refine, and Succeed through LLM-Empowered DevOps Simulation*. FSE2026 research paper, first preprint2025; downloaded arXiv2506.05623v3 dated2026-01-11,23 pages. [Primary record](https://arxiv.org/abs/2506.05623); [conference entry](https://conf.researchr.org/details/fse-2026/fse-2026-research-papers/43/Deployability-Centric-Infrastructure-as-Code-Generation-Fail-Learn-Refine-and-Suc).

**Method and evidence:**153 AWS CloudFormation scenarios span58 services; IaCGen uses format, syntax and live-deployment feedback (pp.4–9). Table2 shows20.8–30.2% first-attempt deployability across six historical models and54.6–91.6% success within10 iterations (p.11). Intent assessment samples51 scenarios;25.2% satisfy both resource and attribute requirements across models. The8.4% security figure is filtered full-template Checkov compliance, excluding templates without applicable checks (pp.15–16). Historical model/configuration scope limits transferability (p.18). [Versioned PDF](https://arxiv.org/pdf/2506.05623v3).

**CloudCanvas inference:** Validate real AWS creation, cleanup, intent and security independently. Its proposed experiments must use isolated accounts and bounded costs. CloudCanvas's persistence and SDK workflow are implemented features, but current mocked service tests are not a head-to-head deployment benchmark against IaCGen.

#### 10 — Cloud Infrastructure Management in the Age of AI Agents

**Bibliography:** Zhenning Yang, Archit Bhatnagar, Yiming Qiu, Tongyuan Miao, Patrick Tser Jern Kon, Yunming Xiao, Yibo Huang, Martin Casado, Ang Chen. *Cloud Infrastructure Management in the Age of AI Agents*,2025, arXiv2506.12270v1,8 pages. Position/preliminary-study preprint; peer-reviewed venue not verified. [Primary record](https://arxiv.org/abs/2506.12270).

**Method and evidence:** A preliminary Azure VM study compares SDK, CLI, Terraform and web agents on provisioning, updates and monitoring (pp.2–4). Provisioning contains three tasks and eight trials per task; models differ between code agents and the web agent, and agent steps are not elapsed time (p.3). The paper proposes unified state, synchronization, policy checks, audit trails, fault tolerance and human supervision, rather than establishing a finished universal cloud-management system (pp.5–6). [Versioned PDF](https://arxiv.org/pdf/2506.12270v1).

**CloudCanvas inference:** Explicit Apply/Publish review is consistent with existing human-supervision research. Its AWS graph and catalog-grounded tools constitute a concrete narrow implementation, not evidence that it outperforms the paper's Azure agents. Atomic operation reservation, durable recovery and policy enforcement remain relevant gaps.

### Inferences

- **Implemented overlap, based on parent-supplied code baseline3fb7def:** schema-constrained AI builds; model routing; AWS catalog tools; human review before graph application and publishing; graph-aware SDK execution; persisted state. These are architectural relationships, not quantitative performance claims.
- **Potential combined differentiation:** one editable intermediate graph links manual design, validated AI drafts, output references and resource state. This is a product/workflow distinction whose usability benefit needs a controlled user study.
- **Priority learning:** build a prompt-to-graph evaluation corpus with independently scored schema, dependency, intent, security, deployability and cleanup outcomes. Keep first-attempt and bounded-retry results separate, report denominators, and include failed/partial runs.
- **Mutation learning:** compare before/after graphs and count unintended changes. Graph replacement must not be advertised as non-destructive incremental mutation.
- **Agent safety learning:** review gates help operator control but do not replace authorization, operation locking, policy checking or recoverable jobs.

### Gaps

- None of the five papers evaluates CloudCanvas; no superiority, speedup, cost saving, security improvement, or global novelty can be inferred directly.
- IaC-Eval and TerraFormer use speculative Terraform planning as a verifier; that is not proof of successful live cloud operations.
- Multi-IaC-Eval uses static checks and an LLM judge; its success metrics are not comparable to IaCGen live deployment rates without harmonizing tasks and evaluation.
- Paper10 is preliminary Azure VM evidence, not an AWS/general-cloud production result. Some cited guardrails are proposals, not experimentally validated features.
- Paper06's *dataset* is described as CC BY4.0 and code as MIT; that does not establish the PDF's redistribution license. Papers07/08 are CC BY-NC-ND4.0;09 is CC BY4.0;10 uses arXiv's non-exclusive distribution license, which is not a blanket third-party republication grant. Preserve author attribution, leave PDFs unchanged, and check rights before commercial/public redistribution. Links and provenance are supplied for all originals.
