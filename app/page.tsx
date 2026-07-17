"use client";

import { useEffect, useMemo, useState } from "react";

type Process = { name: string; pid: number; cpu: number; ram: number };
type Metrics = { cpu:number; memory:number; disk:number; read:number; write:number; time:string; uptime:string; memoryUsed:number; memoryTotal:number; diskName:string; diskFree:number; processes:Process[] };
type View = "inicio" | "chat" | "lab" | "procesos" | "ajustes";
type Mood = "calm" | "focused" | "tired";

const fallback: Metrics = {
  cpu:18,memory:56,disk:12,read:0,write:0,time:"--:--:--",uptime:"--",memoryUsed:8.9,memoryTotal:15.9,
  diskName:"Disco 1 - SSD 1TB (E:)",diskFree:817.6,
  processes:[
    {name:"steamwebhelper",pid:18856,cpu:2.8,ram:417.7},
    {name:"wallpaper64",pid:7700,cpu:1.6,ram:341.7},
    {name:"ChatGPT",pid:8380,cpu:1.1,ram:278.8},
  ],
};

const profiles = {
  Gaming:{copy:"Estoy priorizando FPS estables y vigilando la memoria de video.",mood:"focused" as Mood},
  Estudio:{copy:"Mantengo tus herramientas listas sin gastar recursos de más.",mood:"calm" as Mood},
  Chill:{copy:"Todo está tranquilo. Podemos bajar el ritmo y ahorrar energía.",mood:"calm" as Mood},
  Movie:{copy:"Estoy cuidando una reproducción fluida y sin interrupciones.",mood:"focused" as Mood},
};

const labels:Record<View,string>={inicio:"Sistema / Inicio",chat:"Sistema / Chat",lab:"Sistema / Laboratorio",procesos:"Sistema / Procesos",ajustes:"Sistema / Ajustes"};

export default function Home(){
  const [view,setView]=useState<View>("inicio");
  const [mode,setMode]=useState<keyof typeof profiles>("Estudio");
  const [mood,setMood]=useState<Mood>("calm");
  const [metrics,setMetrics]=useState<Metrics>(fallback);
  const [connected,setConnected]=useState(false);
  const [paused,setPaused]=useState(false);
  const [question,setQuestion]=useState("¿Por qué estabas lenta hace rato?");
  const [reply,setReply]=useState("Estoy escuchando.");

  useEffect(()=>{
    if(paused)return;
    let active=true;
    const poll=async()=>{try{const response=await fetch("http://127.0.0.1:47831/metrics",{cache:"no-store"});const payload=await response.json() as Metrics;if(active){setMetrics(payload);setConnected(true)}}catch{if(active)setConnected(false)}};
    poll();const timer=window.setInterval(poll,8000);return()=>{active=false;window.clearInterval(timer)};
  },[paused]);

  const healthCopy=useMemo(()=>metrics.memory>88?"La memoria está pesada. ¿Revisamos qué la ocupa?":metrics.disk>92?"El disco está trabajando al límite. Estoy investigando el motivo.":metrics.cpu>90?"El procesador está bajo presión. Veamos quién lo está exigiendo.":"Estoy bien. ¿Qué hacemos hoy?",[metrics]);
  const ask=()=>{const q=question.toLowerCase();setReply(q.includes("lenta")||q.includes("disco")?"El disco E: estuvo saturado durante la transferencia. CPU y RAM tenían margen, así que el almacenamiento marcó el ritmo. No parece que hayas hecho nada mal.":q.includes("virus")||q.includes("proceso")?"Puedo revisar firmas, ubicación y comportamiento. Si necesito inspeccionar archivos, te pediré permiso primero.":"Entendido. Observaré lo que ya puedo ver y te pediré permiso antes de abrir archivos o aplicar cambios.")};
  const chooseMode=(next:keyof typeof profiles)=>{setMode(next);setMood(profiles[next].mood)};
  const cycleMood=()=>setMood(current=>current==="calm"?"focused":current==="focused"?"tired":"calm");

  return <main className="app-shell" data-mood={mood}>
    <header className="brand-header">
      <div className="brand-lockup" aria-label="Reebot Lab"><span className="brand-reebot">REEBOT</span><span className="brand-lab">LAB</span><span className="brand-star" aria-hidden="true">✦</span></div>
      <div className="brand-meta"><span>PERSONAL COMPUTER COMPANION</span><b>EARLY ACCESS / 00.1</b></div>
    </header>

    <div className="workspace">
      <aside className="side-rail" aria-label="Navegación principal">
        {(["inicio","chat","lab","procesos","ajustes"] as View[]).map((item,index)=><button key={item} className={view===item?"rail-item active":"rail-item"} onClick={()=>setView(item)}><span>{String(index+1).padStart(2,"0")}</span><b>{item.toUpperCase()}</b></button>)}
        <div className="rail-status"><i className={connected?"online":"demo"}/>{connected?"EN VIVO":"DEMO"}</div>
      </aside>

      <section className="content-area">
        <div className="content-topline"><span>{labels[view]}</span><div><span className="analysis-dot"/>{paused?"MONITOREO EN PAUSA":"ANALIZANDO EN TIEMPO REAL"}<button onClick={()=>setPaused(value=>!value)}>{paused?"REANUDAR":"PAUSAR"}</button></div></div>

        {view==="inicio"&&<>
          <section className="hero-grid">
            <article className="module black hero-copy">
              <div className="module-top"><span>01 / ESTADO GENERAL</span><span className="state-pill"><i/>{mood==="calm"?"TRANQUILO":mood==="focused"?"CONCENTRADO":"CANSADO"}</span></div>
              <div><h1>{healthCopy}</h1><p>{profiles[mode].copy} {connected?"Estoy leyendo tus recursos reales.":"Ahora mismo estoy mostrando el modo demostración."}</p></div>
              <div className="profile-row"><span>MODO PREFERIDO</span><div>{(Object.keys(profiles) as (keyof typeof profiles)[]).map(profile=><button key={profile} className={mode===profile?"active":""} onClick={()=>chooseMode(profile)}>{profile}</button>)}</div></div>
            </article>

            <article className="mascot-card">
              <div className="mascot-top"><span>REE / ID-001</span><button onClick={cycleMood}>CAMBIAR ÁNIMO</button></div>
              <div className="orbital orbital-one"/><div className="orbital orbital-two"/><div className="mascot-glow"/>
              <img className="mascot-image" src="/reebot-mascot.png" alt="REE, la mascota robótica de REEBOT LAB" />
              <div className="mascot-caption">TU PC ESTÁ PRESENTE</div>
            </article>
          </section>

          <section className="metric-grid"><MetricCard label="CPU / PROCESADOR" value={metrics.cpu} meta="RYZEN 7 5700G"/><MetricCard label="RAM / MEMORIA" value={metrics.memory} meta={`${metrics.memoryUsed.toFixed(1)} DE ${metrics.memoryTotal.toFixed(1)} GB`}/><MetricCard label="DISK / UNIDAD E:" value={metrics.disk} meta={`${metrics.write.toFixed(1)} MB/S ESCRITURA`}/></section>

          <section className="lower-grid">
            <article className="module black experiment-card">
              <div className="module-top"><span>03 / EXPERIMENTO SUGERIDO</span><span className="state-pill">LISTO</span></div>
              <h2>¿Comprobamos la velocidad real del SSD?</h2><p>Estuvo al 100% y escribió a sólo 42 MB/s. Puedo medirlo sin cambiar tu configuración.</p>
              <div className="experiment-flow"><b>MEDIR</b><span>→</span><b>PROBAR</b><span>→</span><b>COMPARAR</b><span>→</span><b>RESTAURAR</b></div>
              <div className="experiment-actions"><button onClick={()=>setReply("Crearé archivos temporales, mediré la velocidad y los eliminaré al terminar. No tocaré tu configuración.")}>SÓLO EXPLÍCAME</button><button className="light" onClick={()=>setReply("Primero te pediré cuánto espacio puedo usar y confirmaré que tienes respaldo. Después comenzamos juntos.")}>HACERLO JUNTOS</button></div>
            </article>
            <article className="chat-card"><span>02 / CHAT DIRECTO</span><h2>Pregúntale algo a tu PC</h2><div className="quick-chat"><input value={question} onChange={event=>setQuestion(event.target.value)} onKeyDown={event=>event.key==="Enter"&&ask()}/><button onClick={ask}>ENVIAR ↗</button></div><p>{reply}</p></article>
          </section>
        </>}

        {view==="chat"&&<section className="module black full-view"><span className="section-code">02 / CONVERSACIÓN DIRECTA</span><h1>Habla con tu PC.</h1><p>Pregunta por procesos, archivos, rendimiento o cualquier cosa que no entiendas.</p><div className="full-chat"><input value={question} onChange={event=>setQuestion(event.target.value)} placeholder="¿Qué te está pasando?"/><button onClick={ask}>PREGUNTAR</button></div><div className="assistant-reply"><b>REEBOT</b><p>{reply}</p></div></section>}
        {view==="lab"&&<section className="module black full-view"><span className="section-code">03 / LABORATORIO</span><h1>Experimentos guiados.</h1><p>Cada prueba mide antes y después, restaura tu configuración y aprende del resultado.</p><LabEntry index="#001" title="SSD 1TB" detail="Pendiente · velocidad y capacidad real"/><LabEntry index="#000" title="Transferencia de juego" detail="Observado · disco saturado a 42 MB/s"/></section>}
        {view==="procesos"&&<section className="module black full-view"><span className="section-code">04 / PROCESOS</span><h1>¿Quién usa mis recursos?</h1><div className="process-table"><div className="process-row heading"><span>PROCESO</span><span>CPU</span><span>RAM</span></div>{metrics.processes.map(process=><div className="process-row" key={process.pid}><span><b>{process.name}</b><small>PID {process.pid}</small></span><span>{process.cpu.toFixed(1)}%</span><span>{process.ram.toFixed(0)} MB</span></div>)}</div></section>}
        {view==="ajustes"&&<section className="module black full-view"><span className="section-code">05 / PERSONALIZACIÓN</span><h1>Tu Reebot, tus reglas.</h1><div className="settings-grid"><label>NOMBRE DE LA PC<input defaultValue="Nébula"/></label><label>EXPERIENCIA<select defaultValue="intermedio"><option value="nuevo">Es mi primera PC</option><option value="intermedio">Tengo algo de técnico</option><option value="experto">Conozco bien mi PC</option></select></label><label>CONSUMO VISUAL<select defaultValue="visual"><option value="ahorro">Ahorro</option><option value="normal">Normal</option><option value="visual">Visual</option></select></label></div></section>}
      </section>
    </div>
  </main>;
}

function MetricCard({label,value,meta}:{label:string;value:number;meta:string}){return <article className="module black metric-card"><span>{label}</span><strong>{Math.round(value)}%</strong><small>{meta}</small><div className="meter"><i style={{width:`${Math.min(100,value)}%`}}/></div></article>}
function LabEntry({index,title,detail}:{index:string;title:string;detail:string}){return <div className="lab-entry"><span>{index}</span><div><b>{title}</b><p>{detail}</p></div><button>ABRIR</button></div>}
