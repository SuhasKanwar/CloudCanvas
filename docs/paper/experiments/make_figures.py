"""Rebuild vector paper figures from recorded results; no provider or AWS access."""
from pathlib import Path
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

PAPER = Path(__file__).resolve().parents[1]
DATA = json.loads((PAPER / 'results/validation-results.json').read_text())
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10,
    'pdf.fonttype': 42, 'svg.fonttype': 'none', 'axes.spines.top': False,
    'axes.spines.right': False, 'savefig.bbox': 'tight'})
COLORS = ['#718096', '#3182bd', '#146b45']

def save(fig, name):
    for suffix in ('pdf', 'svg'):
        output = PAPER / 'figures' / f'{name}.{suffix}'
        fig.savefig(output, facecolor='white')
        if suffix == 'svg':
            output.write_text('\n'.join(line.rstrip() for line in output.read_text().splitlines()) + '\n')
    plt.close(fig)

# Layout uses normalized coordinates and checks that every label fits its panel.
def panel(ax,x,y,w,h,title,body,color='#f4f7fa'):
    patch=FancyBboxPatch((x-w/2,y-h/2),w,h,
        boxstyle='round,pad=0.006,rounding_size=0.012',fc=color,ec='#334c5e',lw=1.0)
    ax.add_patch(patch)
    title_text=ax.text(x,y+h*.28,title,ha='center',va='center',fontsize=10,weight='bold')
    body_text=ax.text(x,y-h*.12,body,ha='center',va='center',fontsize=9,linespacing=1.35)
    return patch,(title_text,body_text)

def routed(ax,points,dashed=False,both=False):
    for a,b in zip(points,points[1:-1]):
        ax.plot([a[0],b[0]],[a[1],b[1]],color='#455b6a',lw=1.05,ls='--' if dashed else '-')
    a,b=points[-2:]
    ax.add_patch(FancyArrowPatch(a,b,arrowstyle='<->' if both and len(points)==2 else '-|>',
        mutation_scale=11,lw=1.05,color='#455b6a',linestyle='--' if dashed else '-'))

def fitted(fig,panels):
    fig.canvas.draw()
    renderer=fig.canvas.get_renderer()
    for patch,texts in panels:
        bounds=patch.get_window_extent(renderer)
        for text in texts:
            label=text.get_window_extent(renderer)
            assert bounds.x0-2 <= label.x0 and label.x1 <= bounds.x1+2, text.get_text()
            assert bounds.y0-2 <= label.y0 and label.y1 <= bounds.y1+2, text.get_text()

fig,ax=plt.subplots(figsize=(6.4,5.7))
fig.subplots_adjust(left=.03,right=.97,bottom=.03,top=.97)
ax.set(xlim=(0,1.03),ylim=(-.05,1.04));ax.axis('off')
panels=[]
panels.append(panel(ax,.5,.93,.86,.16,'Next.js workspace',
    'React Flow, forms and saved drafts\nExplicit Apply blueprint / Publish'))
panels.append(panel(ax,.15,.65,.26,.20,'Shared contract',
    'JSON Schema\nTopology\nReferences','#eef5ed'))
panels.append(panel(ax,.53,.65,.40,.22,'Express application API',
    'Ownership and API routes\nGraph planning + references\nAWS SDK dispatch','#e9f0f8'))
panels.append(panel(ax,.90,.65,.18,.20,'AWS',
    'Create / read\nUpdate / delete','#f4f0e8'))
panels.append(panel(ax,.29,.31,.50,.20,'FastAPI / LangGraph',
    'Structured build / conversation\nCatalog tools call back to Express'))
panels.append(panel(ax,.80,.31,.34,.20,'PostgreSQL / Prisma',
    'Graphs + conversations\nDesired / observed state\nDeployment records'))
panels.append(panel(ax,.29,.06,.50,.14,'External model providers',
    'Groq: routing + structured builds\nNVIDIA: tool-enabled conversation','#f4f0e8'))
routed(ax,[(.53,.843),(.53,.768)],both=True)
ax.text(.63,.805,'Authenticated API',fontsize=8.5,va='center')
routed(ax,[(.15,.757),(.15,.843)],dashed=True)
routed(ax,[(.286,.65),(.324,.65)],dashed=True)
routed(ax,[(.736,.65),(.804,.65)])
routed(ax,[(.44,.534),(.29,.416)],both=True)
ax.text(.255,.477,'Query / draft',fontsize=8.5,ha='center')
routed(ax,[(.65,.534),(.80,.416)],both=True)
ax.text(.86,.477,'Persist state',fontsize=8.5,ha='center')
routed(ax,[(.29,.204),(.29,.137)],both=True)
ax.text(.55,.165,'Model requests',fontsize=8.5)
ax.text(.52,-.045,'Solid: runtime request / response. Dashed: imported shared library.',
    ha='center',fontsize=8.3)
fitted(fig,panels)
save(fig,'architecture')

fig,ax=plt.subplots(figsize=(6.4,6.4))
fig.subplots_adjust(left=.03,right=.97,bottom=.03,top=.97)
ax.set(xlim=(0,1.02),ylim=(-.03,1.05));ax.axis('off')
panels=[]
steps=[
 (.95,'1  Create a draft','Manual resource design or AI proposal'),
 (.77,'2  Validate the graph','Schema, attachment and reference checks'),
 (.59,'3  Review and Apply','Inspect the blueprint; save the graph'),
 (.41,'4  Publish explicitly','Check ownership and deployment inputs'),
 (.23,'5  Execute dependencies','Order, wait, resolve outputs, call SDK'),
 (.05,'6  Observe the outcome','Persist results; poll status and outputs'),
]
for y,title,body in steps:
    panels.append(panel(ax,.65,y,.63,.12,title,body,'#e9f0f8' if y in (.77,.41) else '#f4f7fa'))
for a,b in zip(steps,steps[1:]):routed(ax,[(.65,a[0]-.067),(.65,b[0]+.067)])
panels.append(panel(ax,.14,.77,.245,.12,'Invalid draft','Correct and retry','#fbf1eb'))
routed(ax,[(.328,.77),(.269,.77)])
routed(ax,[(.011,.77),(.004,.77),(.004,.95),(.328,.95)])
panels.append(panel(ax,.14,.23,.245,.14,'Record failure','Inspect partial state;\nclean up explicitly','#fbf1eb'))
routed(ax,[(.328,.23),(.269,.23)])
ax.text(.80,.68,'Valid draft',fontsize=8.5)
ax.text(.80,.14,'Successful step',fontsize=8.5)
fitted(fig,panels)
save(fig,'workflow')

names=['schema-only','schema-topology','full-contract']
labels=['Schema only','Schema + topology','Full contract']
categories=['shape','topology','references']
fig,ax=plt.subplots(figsize=(6.5,3.5))
for j,name in enumerate(names):
    decisions = next(m['decisions'] for m in DATA['runs'][0]['measurements']
                     if m['validator'] == name)
    counts = [sum(d['accepted'] for d in decisions if d['category'] == category)
              for category in categories]
    xs=[i+(j-1)*.24 for i in range(3)]
    ax.bar(xs,counts,width=.22,label=labels[j],color=COLORS[j])
    for x,y in zip(xs,counts):ax.text(x,y+.35,str(y),ha='center',fontsize=9)
ax.set(xticks=range(3),xticklabels=['Shape / types','Topology','References'],
       ylabel='Invalid cases accepted (of 16)',ylim=(0,19))
ax.legend(frameon=False,loc='upper center',bbox_to_anchor=(.5,1.22),ncol=3,fontsize=9)
ax.yaxis.grid(True,alpha=.2);ax.set_axisbelow(True)
save(fig,'validation-errors')

fig,ax=plt.subplots(figsize=(6.5,3.3))
summary={r['validator']:r for r in DATA['summary']}
means=[summary[n]['meanMsPerGraph']*1000 for n in names]
stds=[summary[n]['sdMsPerGraph']*1000 for n in names]
ax.bar(range(3),means,yerr=stds,capsize=5,color=COLORS,width=.55)
ax.set(xticks=range(3),xticklabels=['Schema\nonly','Schema +\ntopology','Full\ncontract'],
       ylabel='Clone + validation time (microseconds / graph)',ylim=(0,max(m+s for m,s in zip(means,stds))*1.35))
for i,(m,s) in enumerate(zip(means,stds)):ax.text(i,m+s+3,f'{m:.1f} ± {s:.1f}',ha='center',fontsize=10)
ax.yaxis.grid(True,alpha=.2);ax.set_axisbelow(True)
ax.text(.5,1.02,'Mean ± sample SD across 3 independent Node.js processes',transform=ax.transAxes,ha='center',fontsize=9)
save(fig,'validation-latency')

lines=[r'\begin{tabular}{lrrrr}',r'\toprule',
       r'Pipeline & Accuracy (\%) & False accepts / 48 & False rejects / 24 & Time ($\mu$s) \\',r'\midrule']
for label,name in zip(labels,names):
    row=summary[name]
    accuracy=f"{100*row['accuracyMean']:.2f} \\pm {100*row['accuracySd']:.2f}"
    if name=='full-contract':accuracy=r'\mathbf{'+accuracy+'}'
    lines.append(label+f" & ${accuracy}$ & ${row['falseAcceptedMean']:.0f} \\pm {row['falseAcceptedSd']:.0f}$ & {row['falseRejectedMean']:.0f} & ${row['meanMsPerGraph']*1000:.1f} \\pm {row['sdMsPerGraph']*1000:.1f}$ \\")
lines += [r'\bottomrule',r'\end{tabular}']
# Every table row must end in the LaTeX two-backslash terminator.
lines=[line+'\\' if line.endswith(' \\') and not line.endswith(' \\\\') else line for line in lines]
(PAPER/'results/validation-table.tex').write_text('\n'.join(lines)+'\n')
assert len(DATA['runs'])==3 and len(DATA['summary'])==3
print('Generated 4 vector figures (PDF/SVG) and measured results table.')
