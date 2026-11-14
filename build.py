import os
root=os.path.dirname(os.path.abspath(__file__))
rd=lambda p:open(os.path.join(root,p),encoding='utf-8').read()
s=rd('src/app.html')
s=s.replace('/*@@EXDATA@@*/',rd('src/exdata.js'),1)
s=s.replace('/*@@FIG@@*/',rd('src/fig.js')+'\n'+rd('src/figgl.js'),1)
open(os.path.join(root,'index.html'),'w',encoding='utf-8').write(s)
print(len(s))
