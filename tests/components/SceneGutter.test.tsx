import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SceneGutter } from '../../client/src/components/writing/screenplay/SceneGutter'

const scene = (index: number, text: string, nodePos: number) => ({ index, text, nodePos })

describe('SceneGutter', () => {
  it('renders nothing when no scenes', () => {
    const { container } = render(<SceneGutter scenes={[]} onSceneClick={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders scene numbers', () => {
    const scenes = [scene(1, 'INT. OFFICE - DAY', 0), scene(2, 'EXT. STREET - NIGHT', 10)]
    render(<SceneGutter scenes={scenes} onSceneClick={vi.fn()} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('calls onSceneClick with nodePos when scene number clicked', () => {
    const onSceneClick = vi.fn()
    const scenes = [scene(1, 'INT. OFFICE - DAY', 42)]
    render(<SceneGutter scenes={scenes} onSceneClick={onSceneClick} />)
    fireEvent.click(screen.getByText('1'))
    expect(onSceneClick).toHaveBeenCalledWith(42)
  })
})
