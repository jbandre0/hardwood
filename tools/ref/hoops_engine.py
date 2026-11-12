# Reference Python engine v9, copied verbatim from the workbook's 'Engine Code' sheet.
# Only change: team table path comes from $TEAMS_JSON.
import json,numpy as np
import os
TJ=json.loads(open(os.environ.get('TEAMS_JSON','/tmp/teams.json')).read())
TR={r[0]:r for r in TJ}
CAL=dict(vk=12.5,fl=4800,st=5766,to=1075,orb=3381,clk=1.075,z3=4490,sto=211,sor=335,sst=0,soa=386,B24=8.958,w2=.72,w3=.25,avgopp2=51.87,avgopp3=33.95,ftr_avg=.3523,toint=6.755,toslope=1.419,fm=1.83,tow=45,sU=0,norm=1,Pavg=0.318129994587758,pf0=0.471649367142857,Uavg=0.557590571428571,ofr_avg=.3502,ofm=1.67)
SECN=np.zeros(30)
for k_,v_ in {1:13,2:13,3:13,4:12,5:12,6:9,7:17,8:17,9:16,10:16,11:24,12:23,13:24,14:23,15:21,16:20,17:21,18:20,19:16,20:17,21:17,22:20,23:20,24:13,25:18,26:18,27:17,28:17,29:30}.items():SECN[k_]=v_
SECS2=SECN*CAL['clk']
PT=np.zeros(30)
for k_,v_ in {1:1,2:2,7:3,9:2,11:3,12:3,15:2,16:2,19:2,20:2,22:3,25:3,27:2}.items():PT[k_]=v_
def team(name):
    r=TR[name];G_=r[2]
    h=dict(zip(["Team","Conf","G","PPG","REB","ST","BL","TO","FT","P3","OR","DR","FTA","FGA","P2","EFG","STR","HFA","POSS","oOR","oEFG","oP2","oP3","oTO","oFT","ownFT"],r))
    X=((h['STR']-4)-4)/1.6/100+1
    L=h['OR']/G_;T=h['DR']/G_;U=(T*(h['BL']/3.5)/100)+0.32
    V=U*(h['EFG']/100)*(h['ST']/h['POSS']*CAL['vk'])
    return dict(name=name,D=h['PPG'],M=h['POSS'],P=h['TO'],I0=h['P3']*X,H0=h['P2']*X,J=h['FT'],L=L,U=U,Q=h['ST'],V=V,oa=h['oOR'],oP2=h['oP2'],oP3=h['oP3'],oTO=h['oTO'],oFT=h['oFT'],ownFT=h['ownFT'])
def matchup(A,B):
    def off(o,d):
        x=dict(o);x['H']=o['H0']+CAL['w2']*(d['oP2']-CAL['avgopp2']);x['I']=o['I0']+CAL['w3']*(d['oP3']-CAL['avgopp3']);return x
    return off(A,B),off(B,A)
def codes_x(o,d,n,rng):
    C=CAL
    Y=rng.random(n);Z=rng.random(n)*10000;AA=rng.random(n)*7;AC=rng.random(n)*10000;AD=rng.random(n)*1000
    AB,AE,AF,AG,AH,AI,AJ,AK=[rng.random(n)*100 for _ in range(8)]
    I,H,J=o['I'],o['H'],o['J'];Vd=d['V']
    AH_=Vd*(2-o['D']/o['M'])
    AI_=min(9500,(C['fl']-1450*(C['Uavg']-0.5)-C['sU']*(d['U']-C['Uavg']))*(C['Pavg']/AH_)*(1+C['fm']*(d['oFT']-C['ftr_avg'])+C['ofm']*(o['ownFT']-C['ofr_avg'])+C['kFT']*o.get('hf',0)))
    stt0=(C['st']-(6.4-d['Q'])*C['sst'])
    AJ_=stt0*((1-C['pf0'])/(1-AI_/10000))
    AK_=23*(((1-C['pf0'])*(1-stt0/10000))/((1-AI_/10000)*(1-min(AJ_,9500)/10000)))
    AL_=C['tow']*(d['oTO']-(C['toint']+C['toslope']*d['Q']))+C['kTO']*o.get('hf',0)
    orthr=C['orb']-(8.4-o['L'])*C['sor']-(C['B24']-d['oa'])*C['soa']
    orb=AC<orthr
    put3=np.where(AD<10,19,np.where(AD<386,np.where(AE<I,11,13),np.where(AE<H,15,17)))
    put2=np.where(AD<10,19,np.where(AD<386,np.where(AE<I,12,14),np.where(AE<H,16,18)))
    sh3=np.where(AB<I,7,np.where(orb,put3,8)); sh2=np.where(AB<H,9,np.where(orb,put2,10))
    normal=np.where(Z<(C['to']-((13.1-o['P'])*C['sto'])+AL_),np.where(AA<4,4,5),np.where(Z<C['z3'],sh3,sh2))
    ftor=np.where(AJ<75,np.where(AE<H,20,21),np.where(AE<I,22,23))
    two=np.where(AG<J,np.where(AH<J,2,np.where(AI<80,1,ftor)),np.where(AH<J,1,np.where(AI<80,3,ftor)))
    oao=np.where(AG<J,np.where(AH<J,2,np.where(AI<80,1,ftor)),np.where(AI<80,24,ftor))
    foul=np.where(AF<72,two,oao)
    oob=np.where(AD<10,19,np.where(AD<386,np.where(AE<I,25,26),np.where(AE<H,27,28)))
    other=np.where(AC<AJ_,6,np.where(AK<AK_,29,oob))
    de=np.where(Z<AI_,foul,other)
    c=np.where(Y>(Vd-((Vd*(o['D']/o['M']))-Vd)),normal,de)
    return c.astype(int),(AG<J)
def sim_game(Aoff,Boff,Ad,Bd,ng,rng,first="B",R=130):
    cA,fA=codes_x(Aoff,Bd,(ng,R),rng);cB,fB=codes_x(Boff,Ad,(ng,R),rng)
    c=np.empty((ng,2*R),int);fm=np.empty((ng,2*R),bool)
    if first=="B": c[:,0::2]=cB;c[:,1::2]=cA;fm[:,0::2]=fB;fm[:,1::2]=fA;bidx=0;aidx=1
    else: c[:,0::2]=cA;c[:,1::2]=cB;fm[:,0::2]=fA;fm[:,1::2]=fB;bidx=1;aidx=0
    clk=2400-np.cumsum(SECS2[c],axis=1)
    live=np.concatenate([np.ones((ng,1),bool),clk[:,:-1]>=1],axis=1)
    pts=(PT[c]+((np.isin(c,[20,21,22,23]))&fm))*live
    return pts[:,aidx::2].sum(1),pts[:,bidx::2].sum(1)
def run_pair(an,bn,ng=20000,seed=1):
    rng=np.random.default_rng(seed);A=team(an);B=team(bn);Ao,Bo=matchup(A,B)
    r=[sim_game(Ao,Bo,A,B,ng//2,rng,f) for f in ("B","A")]
    return np.concatenate([x[0] for x in r]),np.concatenate([x[1] for x in r])


# ---------------------------------------------------------------------------
# Home-court (v9) wrapper. Constants mirror Calibration!K45:K50 and Engine!BF.
# ---------------------------------------------------------------------------
HOME=dict(k2=0.93,k3=0.34,kTO=-45,kFT=0.11,w=0.5,ft90=0.0,HAVG=3.70147058823529)
CAL.update(kFT=HOME['kFT'],kTO=HOME['kTO'])

def predict(home_or_A,B,venue="neutral",ng=40000,seed=1):
    """venue: 'neutral' | 'A_home' | 'B_home'. Returns dict with P(A wins), margin (A-B), total, sd.
    Possession order is split 50/50 over ng simulated games (the Excel engine always starts Team B)."""
    A=home_or_A
    a=team(A);b=team(B);Ao,Bo=matchup(a,b);Ao=dict(Ao);Bo=dict(Bo)
    if venue in ("A_home","B_home"):
        hn=A if venue=="A_home" else B
        s=1+HOME['w']*(TR[hn][17]/HOME['HAVG']-1)
        for o,sg in ((Ao,1 if venue=="A_home" else -1),(Bo,-1 if venue=="A_home" else 1)):
            o['hf']=sg*s;o['H']+=HOME['k2']*sg*s;o['I']+=HOME['k3']*sg*s
    rng=np.random.default_rng(seed)
    r=[sim_game(Ao,Bo,a,b,ng//2,rng,f) for f in ("B","A")]
    sA=np.concatenate([x[0] for x in r]);sB=np.concatenate([x[1] for x in r]);m=sA-sB
    return dict(p=float(((sA>sB)+0.5*(sA==sB)).mean()),margin=float(m.mean()),total=float((sA+sB).mean()),sd=float(m.std()),scoreA=float(sA.mean()),scoreB=float(sB.mean()))

