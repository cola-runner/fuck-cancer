// Presentational screens. State lives in App (app.jsx); these take props.

/* ---------------- Cases list ---------------- */
function CasesScreen({ onOpen }) {
  return (
    <div className="screen" data-screen-label="病例列表">
      <div className="topbar" style={{ flexDirection: "column", alignItems: "stretch", gap: 4, paddingTop: 26 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ color: "var(--sage)" }}><IconLeaf size={24} /></span>
            <h1 style={{ fontSize: 21 }} lang="zh">陪伴</h1>
          </div>
          <button className="iconbtn" aria-label="账户"><IconUser size={20} /></button>
        </div>
      </div>

      <div className="scroll" style={{ padding: "8px 22px 40px" }}>
        <p lang="zh" style={{ fontSize: 27, fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "-.4px", lineHeight: 1.3, marginTop: 6 }}>
          你照顾的人，<br />我替你记着。
        </p>
        <p lang="zh" className="muted" style={{ fontSize: 15, marginTop: 10, marginBottom: 22 }}>
          每位家人一个病程档案，资料、用药、问答都在一处。
        </p>

        {CASES.map((c, i) => (
          <button
            key={c.id}
            onClick={() => onOpen(c)}
            className="card rise"
            style={{
              width: "100%", textAlign: "left", cursor: "pointer",
              padding: 18, marginBottom: 14, display: "flex", alignItems: "center", gap: 15,
              animationDelay: `${i * 70}ms`, border: "1px solid var(--line-2)",
            }}
          >
            <div className="tile" style={{
              width: 52, height: 52,
              background: c.accent === "sage" ? "var(--sage-tint)" : "var(--coral-tint)",
              color: c.accent === "sage" ? "var(--sage-strong)" : "var(--coral-strong)",
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, borderRadius: 16,
            }}>
              {c.name[0]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span lang="zh" style={{ fontSize: 18, fontWeight: 600, fontFamily: "var(--font-display)" }}>{c.name}</span>
                <span lang="zh" className="faint" style={{ fontSize: 12.5 }}>{c.relation}</span>
              </div>
              <div lang="zh" className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>{c.diagnosis}</div>
              <div style={{ display: "flex", gap: 7, marginTop: 11 }}>
                <span className="chip chip-sage" lang="zh">{c.docCount} 份资料</span>
                <span className="chip chip-official" lang="zh">
                  <IconShield size={13} /> {c.autoCount} 份官方说明
                </span>
              </div>
            </div>
            <span className="faint" style={{ alignSelf: "flex-start" }}><IconChevron size={18} /></span>
          </button>
        ))}

        <button className="btn btn-ghost" style={{ width: "100%", marginTop: 6, color: "var(--sage-strong)" }} lang="zh">
          <IconPlus size={18} /> 新建病例
        </button>
      </div>
    </div>
  );
}

/* ---------------- Document row ---------------- */
function DocRow({ d, delay }) {
  const isOfficial = d.kind === "official";
  const tileBg = d.kind === "note" ? "var(--sage-tint)" : "var(--official-tint)";
  const tileColor = d.kind === "note" ? "var(--sage-strong)" : "var(--official)";
  return (
    <div className="card rise" style={{ padding: 15, marginBottom: 11, display: "flex", gap: 13, animationDelay: `${delay}ms` }}>
      <div className="tile" style={{ background: tileBg, color: tileColor }}>
        {d.kind === "note" ? <IconDoc size={22} /> : <IconPill size={22} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <span lang="zh" style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.4 }}>{d.title}</span>
          {d.status === "processing"
            ? <span className="chip chip-amber dot-pulse" lang="zh" style={{ flexShrink: 0 }}>整理中</span>
            : isOfficial
              ? <span className="chip chip-official" lang="zh" style={{ flexShrink: 0 }}><IconShield size={12} /> 官方</span>
              : <span className="chip chip-sage" lang="zh" style={{ flexShrink: 0 }}><IconCheck size={12} /> 已就绪</span>}
        </div>

        {d.snippet && <p lang="zh" className="muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.65,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{d.snippet}</p>}

        {isOfficial && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <span lang="zh" className="faint" style={{ fontSize: 12.5 }}>{d.source}</span>
            <span className="faint" style={{ fontSize: 12 }}>·</span>
            <a className="lat" style={{ fontSize: 12.5, color: "var(--official)", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
              查看原文 <IconExternal />
            </a>
          </div>
        )}
        {!isOfficial && <div lang="zh" className="faint" style={{ fontSize: 12.5, marginTop: 7 }}>{d.meta}</div>}
      </div>
    </div>
  );
}

/* ---------------- Case detail (HERO) ---------------- */
function DetailScreen({ caseItem, onBack, onChat }) {
  const notes = DOCS.filter((d) => d.kind === "note");
  const official = DOCS.filter((d) => d.kind === "official");
  return (
    <div className="screen" data-screen-label="病例详情">
      <div className="topbar">
        <button className="iconbtn" onClick={onBack} aria-label="返回"><IconBack size={20} /></button>
        <div style={{ flex: 1 }} />
        <button className="iconbtn" aria-label="更多" style={{ fontSize: 20 }}>⋯</button>
      </div>

      <div className="scroll" style={{ padding: "4px 22px 110px" }}>
        {/* patient header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <div className="tile" style={{ width: 56, height: 56, background: "var(--sage-tint)", color: "var(--sage-strong)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, borderRadius: 18 }}>
            {caseItem.name[0]}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h1 lang="zh" style={{ fontSize: 25, fontFamily: "var(--font-display)", fontWeight: 600 }}>{caseItem.name}</h1>
              <span lang="zh" className="faint" style={{ fontSize: 13 }}>{caseItem.relation}</span>
            </div>
            <div lang="zh" className="muted" style={{ fontSize: 14, marginTop: 1 }}>{caseItem.diagnosis}</div>
          </div>
        </div>

        {/* reassurance banner — the hero feature, framed as care */}
        <div className="rise" style={{
          background: "linear-gradient(135deg, var(--sage-tint) 0%, var(--sage-tint-2) 100%)",
          borderRadius: "var(--r-lg)", padding: "16px 17px", display: "flex", gap: 13, marginTop: 18, marginBottom: 26,
        }}>
          <div style={{ color: "var(--sage-strong)", flexShrink: 0, marginTop: 1 }}><IconShield size={26} /></div>
          <div>
            <div lang="zh" style={{ fontSize: 15, fontWeight: 600, color: "var(--sage-strong)" }}>已为你收集官方用药说明</div>
            <p lang="zh" style={{ fontSize: 13.5, color: "var(--sage-strong)", opacity: .9, marginTop: 3, lineHeight: 1.6 }}>
              上传出院记录后，我自动找到了卡培他滨、华法林的 FDA / DailyMed 权威说明书。问答时会引用原文，不会乱猜。
            </p>
          </div>
        </div>

        {/* your uploads */}
        <SectionLabel>你的资料</SectionLabel>
        {notes.map((d, i) => <DocRow key={d.id} d={d} delay={i * 60} />)}

        {/* auto-collected official */}
        <SectionLabel right={<span className="chip chip-official" lang="zh"><IconShield size={12} /> 自动整理</span>}>
          官方用药说明
        </SectionLabel>
        {official.map((d, i) => <DocRow key={d.id} d={d} delay={120 + i * 60} />)}
      </div>

      {/* sticky ask bar */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 18px calc(16px + env(safe-area-inset-bottom))",
        background: "linear-gradient(180deg, rgba(244,238,230,0), var(--bg) 38%)" }}>
        <button className="btn btn-coral" style={{ width: "100%", height: 56 }} onClick={onChat} lang="zh">
          <IconSpark size={19} /> 问问 AI（基于以上资料）
        </button>
      </div>
    </div>
  );
}

function SectionLabel({ children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 2px 12px" }}>
      <span lang="zh" style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-2)", letterSpacing: ".3px" }}>{children}</span>
      {right}
    </div>
  );
}

/* ---------------- Chat ---------------- */
function ChatScreen({ caseItem, onBack }) {
  return (
    <div className="screen" data-screen-label="AI 问答">
      <div className="topbar">
        <button className="iconbtn" onClick={onBack} aria-label="返回"><IconBack size={20} /></button>
        <div>
          <h1 lang="zh" style={{ fontSize: 17 }}>问问 AI</h1>
          <div lang="zh" className="faint" style={{ fontSize: 12 }}>基于 {caseItem.name} 的 {caseItem.docCount} 份资料</div>
        </div>
      </div>

      <div className="scroll" style={{ padding: "10px 18px 18px", display: "flex", flexDirection: "column", gap: 18 }}>
        {CHAT.map((m, i) =>
          m.role === "user"
            ? <div key={i} className="bubble-user rise" lang="zh">{m.text}</div>
            : <AnswerBlock key={i} m={m} />
        )}
      </div>

      {/* suggested + input */}
      <div style={{ padding: "0 16px 6px", display: "flex", gap: 8, overflowX: "auto" }}>
        {SUGGESTED.map((q) => <button key={q} className="qchip" lang="zh">{q}</button>)}
      </div>
      <div className="inputbar">
        <input lang="zh" placeholder="问问关于病情、用药的任何问题…" defaultValue="" />
        <button className="send" aria-label="发送"><IconSend size={20} /></button>
      </div>
    </div>
  );
}

function AnswerBlock({ m }) {
  return (
    <div className="rise" style={{ display: "flex", flexDirection: "column", gap: 12, alignSelf: "flex-start", maxWidth: "94%" }}>
      <div className="answer">
        {m.paras.map((p, i) => (
          <p key={i} lang="zh" style={{ fontSize: 15, lineHeight: 1.75, marginBottom: i < m.paras.length - 1 ? 11 : 0 }}>
            <strong style={{ color: "var(--coral-strong)" }}>{p.lead}</strong>{" "}
            <span style={{ color: "var(--ink)" }}>{p.rest}</span>
          </p>
        ))}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 14, padding: "10px 12px", background: "var(--amber-tint)", borderRadius: 12 }}>
          <span style={{ color: "var(--amber)", flexShrink: 0, marginTop: 1 }}><IconHeart size={15} /></span>
          <span lang="zh" style={{ fontSize: 12.5, color: "var(--amber)", lineHeight: 1.55 }}>{m.note}</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span lang="zh" className="faint" style={{ fontSize: 12, fontWeight: 700, marginLeft: 2 }}>
          来源 · {m.cites.length} 处官方说明书
        </span>
        {m.cites.map((c) => (
          <button key={c.n} className="cite">
            <span className="cite-num">{c.n}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span lang="zh" style={{ fontSize: 13.5, fontWeight: 600 }}>{c.title}</span>
                <span lang="zh" className="chip chip-official" style={{ fontSize: 10.5, padding: "2px 7px" }}>{c.source}</span>
              </span>
              <span lang="zh" className="muted" style={{ display: "block", fontSize: 12.5, marginTop: 4, lineHeight: 1.6 }}>
                “{c.quote}”
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { CasesScreen, DetailScreen, ChatScreen });
