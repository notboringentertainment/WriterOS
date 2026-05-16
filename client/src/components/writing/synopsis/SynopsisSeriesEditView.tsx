import React, { useEffect, useRef, useState } from 'react'
import {
  createEmptySeriesContent,
  type SynopsisDocumentContent,
  type SynopsisSeriesContent,
} from '@shared/documents'
import { SynopsisHeaderEditor } from './SynopsisHeaderEditor'
import { SynopsisLoglineEditor } from './SynopsisLoglineEditor'
import { SynopsisShowOverviewEditor } from './SynopsisShowOverviewEditor'
import { SynopsisPilotEditor } from './SynopsisPilotEditor'
import { SynopsisSeasonArcEditor } from './SynopsisSeasonArcEditor'
import { SynopsisFutureSeasonsEditor } from './SynopsisFutureSeasonsEditor'
import { SynopsisSeriesCharactersEditor } from './SynopsisSeriesCharactersEditor'
import { SynopsisCompsEditor } from './SynopsisCompsEditor'

export interface SynopsisSeriesEditViewProps {
  content: SynopsisDocumentContent
  onContentPatch: (patch: Partial<SynopsisDocumentContent>) => void
  onClear: () => void
}

const CLEAR_TIMEOUT_MS = 3000

export function SynopsisSeriesEditView({
  content,
  onContentPatch,
  onClear,
}: SynopsisSeriesEditViewProps) {
  // Defensive: parent (SynopsisTab, Task 7) will guarantee non-null, but handle undefined gracefully
  const series: SynopsisSeriesContent = content.series ?? createEmptySeriesContent()

  function patchSeries(next: Partial<SynopsisSeriesContent>) {
    onContentPatch({ series: { ...series, ...next } })
  }

  const [clearArmed, setClearArmed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  function handleClearClick() {
    if (!clearArmed) {
      setClearArmed(true)
      timerRef.current = setTimeout(() => {
        setClearArmed(false)
        timerRef.current = null
      }, CLEAR_TIMEOUT_MS)
    } else {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setClearArmed(false)
      onClear()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <SynopsisHeaderEditor
        value={content.header}
        onChange={(patch) => onContentPatch({ header: { ...content.header, ...patch } })}
        seriesType={series.seriesType}
        episodeLength={series.episodeLength}
        onSeriesTypeChange={(next) => patchSeries({ seriesType: next })}
        onEpisodeLengthChange={(next) => patchSeries({ episodeLength: next })}
      />

      <SynopsisLoglineEditor
        value={content.logline}
        onTextChange={(text) => onContentPatch({ logline: { ...content.logline, text } })}
      />

      <SynopsisShowOverviewEditor
        value={series.showOverview}
        onChange={(next) => patchSeries({ showOverview: next })}
      />

      <SynopsisPilotEditor
        value={series.pilot}
        onChange={(next) => patchSeries({ pilot: next })}
      />

      <SynopsisSeasonArcEditor
        value={series.seasonOneArc}
        onChange={(next) => patchSeries({ seasonOneArc: next })}
      />

      <SynopsisFutureSeasonsEditor
        value={series.futureSeasons}
        onChange={(next) => patchSeries({ futureSeasons: next })}
      />

      <SynopsisSeriesCharactersEditor
        value={series.characters}
        onChange={(next) => patchSeries({ characters: next })}
      />

      <SynopsisCompsEditor
        value={series.compsAndWhyThisShowNow}
        onChange={(next) => patchSeries({ compsAndWhyThisShowNow: next })}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
        <button
          type="button"
          onClick={handleClearClick}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            color: clearArmed ? 'var(--fg)' : 'var(--fg-muted)',
            background: clearArmed ? 'var(--surface-2)' : 'none',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          {clearArmed ? 'Click again to confirm' : 'Clear synopsis'}
        </button>
      </div>
    </div>
  )
}
