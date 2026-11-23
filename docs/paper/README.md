# CloudCanvas research paper

The entry point is [main.tex](main.tex). The [compiled draft](main.pdf) follows the supplied course guidance: a single-column IEEEtran document on A4, 12 pt, one-inch margins, justified prose, numbered figures/tables and an IEEE bibliography. The draft has 4,839 words of prose according to TeXcount, excluding references, with 17 cited references. The diagrams and measured charts are vector PDFs, with editable SVG copies.

## Overleaf

1. Upload [CloudCanvas-Overleaf.zip](CloudCanvas-Overleaf.zip) as a new project. The archive contains the TeX sources, bibliography, vector figures used by LaTeX, and generated results table.
2. Name the project `CSE3_G7` if that is the assigned section and group, and choose `main.tex` as the main document and pdfLaTeX as the compiler. Overleaf runs BibTeX automatically through its build.
3. Replace `PLACEHOLDER` in `\OverleafProjectLink` with the actual project ID. The link appears after Index Terms. Confirm the assigned course faculty name and BMU email before adding the faculty member as an editor or listing them in the author block, as applicable.
4. Confirm the draft contribution allocation with the team and complete the required similarity and AI-content reports before submission. The manuscript declares the use of AI to prepare this draft. The guidance gives conflicting deadlines (18 November, 26 November and 26 December 2026). Confirm the applicable date with course staff.

For a local TeX Live build, run `latexmk -pdf main.tex` from this directory. The checked-in PDF is a preview compiled with Tectonic. The source archive contains everything needed for the manuscript build. The experiment runner uses the application repository in addition to the paper folder.

## Reproduce the offline experiment

From the repository root:

```sh
npm --prefix contracts ci
node docs/paper/experiments/validation-benchmark.mjs
python -m pip install matplotlib
python docs/paper/experiments/make_figures.py
```

The runner builds deterministic cases from eight valid graph patterns and three families of mutations. It launches three fresh Node.js processes, comparing the same schema on all pipelines while removing topology and reference checks in stages. The full validator imports the application contract. Run `npm --prefix contracts test` for its independent repository test suite.

- [Corpus and six boundary controls](results/corpus.json)
- [Environment, source hashes, raw decisions and three runs](results/validation-results.json)
- [Aggregate results](results/validation-summary.csv)
- [Figure generation](experiments/make_figures.py)

Reproduction regenerates the results and figures. The conformance decisions should match the reported classes, while the timing values will vary with the machine and process scheduling. If quantitative values change, review the abstract, results and conclusion before replacing the compiled draft. The study used synthetic graph fixtures without live AWS operations, provider calls or a human participant study.
