// App shell — owns navigation state and mounts to #root.

function App() {
  const [view, setView] = React.useState("cases"); // 'cases' | 'detail' | 'chat'
  const [active, setActive] = React.useState(CASES[0]);

  return (
    <div className="phone">
      {view === "cases" && (
        <CasesScreen onOpen={(c) => { setActive(c); setView("detail"); }} />
      )}
      {view === "detail" && (
        <DetailScreen
          caseItem={active}
          onBack={() => setView("cases")}
          onChat={() => setView("chat")}
        />
      )}
      {view === "chat" && (
        <ChatScreen caseItem={active} onBack={() => setView("detail")} />
      )}

      {/* upload FAB — only on the detail screen */}
      {view === "detail" && (
        <button className="fab" aria-label="添加资料"><IconPlus size={26} /></button>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
