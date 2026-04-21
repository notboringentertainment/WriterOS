import React from 'react';
import { TopBar, LeftNav, RightDrawer } from './ui/frame.jsx';
import { MissionControl, TriageView, TaskQueue, HandoffTimeline } from './ui/screens-mission.jsx';
import { HiveMind, StructureView, CastView, WorldView, ScenesView, AgentWorkbench } from './ui/screens-knowledge.jsx';
import { StateInspector, FutureModules, SettingsView } from './ui/screens-system.jsx';

function ScreenRouter({ screen, setScreen }) {
  if (screen === 'control')   return <MissionControl setScreen={setScreen}/>;
  if (screen === 'triage')    return <TriageView setScreen={setScreen}/>;
  if (screen === 'tasks')     return <TaskQueue/>;
  if (screen === 'handoffs')  return <HandoffTimeline/>;
  if (screen === 'memory')    return <HiveMind/>;
  if (screen === 'structure') return <StructureView/>;
  if (screen === 'cast')      return <CastView/>;
  if (screen === 'world')     return <WorldView/>;
  if (screen === 'scenes')    return <ScenesView/>;
  if (screen === 'inspector') return <StateInspector/>;
  if (screen === 'modules')   return <FutureModules/>;
  if (screen === 'settings')  return <SettingsView/>;
  if (screen.startsWith('agent:')) return <AgentWorkbench agentId={screen.split(':')[1]}/>;
  return <MissionControl setScreen={setScreen}/>;
}

export default function App() {
  const [screen, setScreen] = React.useState(() => localStorage.getItem('wos.screen') || 'control');

  React.useEffect(() => {
    localStorage.setItem('wos.screen', screen);
  }, [screen]);

  const activeAgentId = screen.startsWith('agent:') ? screen.split(':')[1] : null;

  return (
    <div style={{
      display: 'grid',
      gridTemplateAreas: `"top top top" "nav main drawer"`,
      gridTemplateColumns: '208px 1fr 320px',
      gridTemplateRows: '48px 1fr',
      height: '100vh',
    }}>
      <TopBar screen={screen} setScreen={setScreen} activeAgentId={activeAgentId}/>
      <LeftNav screen={screen} setScreen={setScreen}/>
      <main style={{ gridArea: 'main', overflowY: 'auto', background: 'var(--bg)', minWidth: 0 }}>
        <ScreenRouter screen={screen} setScreen={setScreen}/>
      </main>
      <RightDrawer screen={screen} activeAgentId={activeAgentId}/>
    </div>
  );
}
