# Visual and model-driven cloud infrastructure papers

Review date: 2026-10-29. These five records are IDs 01–05 of the combined ten-paper collection. Physical PDF page numbers are used below. Papers 01 and 02 include a repository cover sheet, so physical page 2 is paper page 1. Exact bibliography, URLs, manuscript versions, access/license notes, sizes and SHA-256 checksums are in `cloud-papers.json`. Each PDF was parsed with `pdfinfo` and `pdftotext`, and its title/authors and substantive method/evaluation sections were checked. This is a targeted related-work selection, not a systematic literature review.

## 01: What prior visual infrastructure design does Winery establish?

### Takeaway

A browser canvas for typed cloud topologies predates CloudCanvas; visual editing alone is not a defensible novelty claim. [Institutional paper](https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-46-Winery_A_Modeling_Tool_for_TOSCA-based_Cloud_Applications.pdf), PDF pp. 3–5.

### Cited Findings

- **Implemented method:** HTML5 topology modeler, separate type/element manager, REST-backed repository, reusable node/relationship definitions, drag/drop topology composition and CSAR import/export. [Paper](https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-46-Winery_A_Modeling_Tool_for_TOSCA-based_Cloud_Applications.pdf), PDF pp. 3–5.
- **Evidence and limits:** A Moodle application using two EC2 VMs demonstrates feasibility. Winery itself contains neither a deployment runtime nor integrated management-plan editing; external plans/runtimes are used. Complex existing infrastructures are outside this demonstration's scope, and the paper supplies no controlled usability or performance comparison. [Paper](https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-46-Winery_A_Modeling_Tool_for_TOSCA-based_Cloud_Applications.pdf), PDF pp. 3–6.

### Inferences

- **CloudCanvas lesson:** Keep type definitions, connection semantics and UI forms aligned. Its AWS SDK deployment and reviewable AI drafts distinguish the integration from this particular modeling-tool demonstration, but not from all prior visual provisioning systems. Reusable validated blueprints would be a proposed improvement, not a current proven advantage.

### Gaps

- No head-to-head user study with CloudCanvas. The institutional copy states Springer copyright, not a broad Creative Commons license; downloading it does not relicense it.

## 02: What does OpenTOSCA teach about deployment execution?

### Takeaway

Topology-driven cloud deployment and stored runtime instance information also predate CloudCanvas. [Institutional paper](https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-45-OpenTOSCA_A_Runtime_for_TOSCA-based_Cloud_Applications.pdf), PDF pp. 3–5.

### Cited Findings

- **Implemented method:** An extensible CSAR runtime with importer, control logic, implementation-artifact engine and plan engine. Workflows access topology, endpoints and instance data through a portability API. [Paper](https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-45-OpenTOSCA_A_Runtime_for_TOSCA-based_Cloud_Applications.pdf), PDF pp. 4–5.
- **Evidence and limits:** The prototype provisions Moodle's VMs, web server, database and connecting configuration, returning an application URL. The 2013 implementation is imperative/plan-based; declarative processing is listed as next work. The evidence is a prototype demonstration, not a quantitative reliability benchmark. [Paper](https://www.iaas.uni-stuttgart.de/publications/INPROC-2013-45-OpenTOSCA_A_Runtime_for_TOSCA-based_Cloud_Applications.pdf), PDF pp. 3–5.

### Inferences

- **CloudCanvas lesson:** Its current in-request AWS SDK loop is a simpler implementation, not proven more reliable. A durable, resumable deployment workflow with explicit failure finalization would address a relevant gap; this is a future engineering recommendation. Preserve the separation between desired graph, executable actions and observed resource state.

### Gaps

- No measured cost, latency, usability or reliability superiority is established for CloudCanvas. The institutional manuscript contains Springer copyright and no stated CC reuse license.

## 03: What does CAMEL add beyond a deployment graph?

### Takeaway

Cloud application models can include requirements, metrics, scaling and execution history in addition to topology. [Publisher article](https://link.springer.com/article/10.1186/s13677-019-0138-7), PDF pp. 3, 7.

### Cited Findings

- **Implemented method:** CAMEL integrates sub-DSLs and separates provider-independent/type-level and provider-specific/runtime-instance models. Deployment, requirement, provider, metric, scalability and execution aspects support the PaaSage workflow; execution mechanisms themselves are outside this language paper's scope. [Paper](https://link.springer.com/content/pdf/10.1186/s13677-019-0138-7.pdf), PDF pp. 3, 7.
- **Evidence and limits:** A 23-practitioner project-based study uses questionnaires/TAM. Perceived usefulness is higher than ease of use, with a paired comparison reported at p=.005. Recruitment is from participating organizations, and whole-platform performance is not evaluated. The paper warns that broader settings/demographics may change conclusions. [Paper](https://link.springer.com/content/pdf/10.1186/s13677-019-0138-7.pdf), PDF pp. 18–21.

### Inferences

- **CloudCanvas lesson:** Measure time-to-correct-deployment and error recovery rather than assuming a visual editor improves usability. UI status polling is not equivalent to CAMEL-style adaptive runtime modeling. SLOs, scaling policies and closed-loop reconciliation are future possibilities, not implemented features.

### Gaps

- The study cannot establish CloudCanvas usability or faster deployment. PDF is publisher version, CC BY 4.0.

## 04: How should CloudCanvas's graph be compared across deployment technologies?

### Takeaway

EDMM provides an existing conceptual vocabulary for comparing deployment models; a resource graph itself is not novel. [Author preprint](https://arxiv.org/abs/1905.07314).

### Cited Findings

- **Implemented method/evidence:** The review identifies 56 technologies and selects 13 for detailed analysis of a common cloud/on-premises reference scenario. Its extracted metamodel includes components, relations, types, properties, operations and artifacts; mappings explain provider/platform-specific restrictions. [Paper v2](https://arxiv.org/pdf/1905.07314v2), PDF pp. 2–4, 6–11.
- **Limits:** Technology selection uses 2019 search-result popularity plus licensing/scope exclusions, and the reference scenario is deliberately simplified. This is a comparison/metamodel study, not proof of universal semantic interchangeability or a runtime benchmark. [Paper v2](https://arxiv.org/pdf/1905.07314v2), PDF pp. 2–4.

### Inferences

- **CloudCanvas lesson:** Document the exact semantics of its four permitted dependency pairings. A future Terraform/CloudFormation exporter needs semantic coverage tests, not only serialization. Current AWS-only adapters do not establish multi-cloud portability or support arbitrary application-level relations.

### Gaps

- Publication dates differ legitimately: first online 26 August 2019; journal issue 35(1–2), pp. 63–75, 2020. Stored PDF is arXiv v2 dated 10 September 2019, not the publisher layout; its record grants arXiv non-exclusive distribution permission, not a blanket downstream license. [Publisher record](https://link.springer.com/article/10.1007/s00450-019-00412-x).

## 05: What stronger validation and evaluation does DOML illustrate?

### Takeaway

Low-code IaC abstractions and infrastructure-model correctness checking are established prior work. [Publisher record](https://www.sciencedirect.com/science/article/pii/S0306437924000802).

### Cited Findings

- **Implemented method:** DOML separates application, abstract infrastructure and concrete infrastructure layers, adds extensibility, generates IaC including Terraform/Ansible/Compose, and uses a Z3-backed model checker for declarative properties. [Institutional publisher PDF](https://repositum.tuwien.at/bitstream/20.500.12708/203669/1/Chiari-2024-Information%20Systems-vor.pdf), PDF pp. 4–7, 12–15.
- **Evidence and limits:** A modified WordPress example triggers network/mapping defects; Table 5 reports sub-second checks in that scenario. An SI-MPA case study involves five experienced team members, including an author. The authors explicitly caution that code-size comparisons and a few deployments do not constitute a complete empirical ease-of-use study or establish generalizability. [Paper](https://repositum.tuwien.at/bitstream/20.500.12708/203669/1/Chiari-2024-Information%20Systems-vor.pdf), PDF pp. 15–18, 20.

### Inferences

- **CloudCanvas lesson:** AJV schema/reference checks establish structural validity, not network reachability, least privilege or policy correctness. Adding invariant checks and a declared verification scope would strengthen assurance. A smaller AWS-specific schema may simplify a workflow, but any usability advantage requires measurement.

### Gaps

- No CloudCanvas-vs-DOML experiment exists in this review. The stored version is the publisher PDF, CC BY 4.0. [Repository/version record](https://repositum.tuwien.at/handle/20.500.12708/203669).
