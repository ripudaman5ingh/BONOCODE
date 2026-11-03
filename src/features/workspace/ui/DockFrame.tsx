import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
} from "../../../shared/ui/icons";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ExplorerMenu } from "../../files/ui/ExplorerMenu";
import { IconButton } from "../../../app/shell/TitleBar";
import {
  clampDockSize,
  defaultDockSize,
  isDockSide,
  isVerticalDock,
  type DockSide,
} from "../../projects/model/projectTerminal";

type Props = {
  /** Names the dock in labels: "Terminal" reads "Move Terminal", "Resize terminal". */
  title: string;
  side: DockSide;
  size: number;
  /** Shown in the hide button's tooltip, e.g. "⌘J". */
  hideShortcut?: string;
  onFocus?: () => void;
  onHide: () => void;
  onSideChange: (side: DockSide) => void;
  onSizePaint: (size: number) => void;
  onSizeCommit: (size: number) => void;
  /** Buttons placed before the move and hide buttons. */
  actions?: ReactNode;
  /**
   * Replaces the title row and the body wrapper. The caller lays out its own
   * header and body, and places `controls` (Move and Hide) in the header.
   */
  renderBody?: (controls: ReactNode) => ReactNode;
  children?: ReactNode;
};

const SIDE_ITEMS: { id: DockSide; label: string }[] = [
  { id: "bottom", label: "Dock Bottom" },
  { id: "top", label: "Dock Top" },
  { id: "left", label: "Dock Left" },
  { id: "right", label: "Dock Right" },
];

const SIDE_ICON = {
  top: PanelTop,
  bottom: PanelBottom,
  left: PanelLeft,
  right: PanelRight,
} as const;

const HIDE_ICON = {
  top: ChevronUp,
  bottom: ChevronDown,
  left: ChevronLeft,
  right: ChevronRight,
} as const;

const BORDER = {
  top: "border-b",
  bottom: "border-t",
  left: "border-r",
  right: "border-l",
} as const;

const SASH = {
  top: "absolute inset-x-0 -bottom-px z-10 h-1.5 cursor-row-resize touch-none",
  bottom: "absolute inset-x-0 -top-px z-10 h-1.5 cursor-row-resize touch-none",
  left: "absolute inset-y-0 -right-px z-10 w-1.5 cursor-col-resize touch-none",
  right: "absolute inset-y-0 -left-px z-10 w-1.5 cursor-col-resize touch-none",
} as const;

/** Header, side picker, hide button and resize sash shared by every dock. */
export function DockFrame({
  title,
  side,
  size,
  hideShortcut,
  onFocus,
  onHide,
  onSideChange,
  onSizePaint,
  onSizeCommit,
  actions,
  renderBody,
  children,
}: Props) {
  const vertical = isVerticalDock(side);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const sideButton = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: number; size: number } | null>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const pending = useRef(size);
  const frame = useRef<number | null>(null);
  const SideIcon = SIDE_ICON[side];
  const HideIcon = HIDE_ICON[side];

  useEffect(() => {
    if (!dragging) return;
    const previous = document.body.style.cursor;
    document.body.style.cursor = vertical ? "row-resize" : "col-resize";
    return () => {
      document.body.style.cursor = previous;
    };
  }, [dragging, vertical]);

  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const paint = (next: number) => {
    pending.current = next;
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      onSizePaint(pending.current);
    });
  };

  const commit = () => {
    if (frame.current != null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    onSizeCommit(pending.current);
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      start: vertical ? event.clientY : event.clientX,
      size: sizeRef.current,
    };
    pending.current = sizeRef.current;
    setDragging(true);
  };

  const onResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const point = vertical ? event.clientY : event.clientX;
    const delta = point - drag.current.start;
    const signed = side === "bottom" || side === "right" ? -delta : delta;
    paint(
      clampDockSize(side, drag.current.size + signed, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  };

  const onResizePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    commit();
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const controls = (
    <div className="flex shrink-0 items-center gap-0.5 pr-1.5">
      {actions}
      <div ref={sideButton}>
        <IconButton
          label={`Move ${title}`}
          onClick={() => {
            const rect = sideButton.current?.getBoundingClientRect();
            if (!rect) return;
            setMenu({ x: rect.left, y: rect.bottom + 4 });
          }}
        >
          <SideIcon className="size-3.5" strokeWidth={1.75} />
        </IconButton>
      </div>
      <IconButton
        label={hideShortcut ? `Hide ${title} (${hideShortcut})` : `Hide ${title}`}
        onClick={onHide}
      >
        <HideIcon className="size-3.5" strokeWidth={1.75} />
      </IconButton>
    </div>
  );

  return (
    <section
      data-dock={title.toLowerCase()}
      className={`relative flex h-full min-h-0 min-w-0 flex-col bg-transparent ${BORDER[side]} border-stroke`}
      onMouseDown={onFocus}
    >
      <div
        role="separator"
        aria-orientation={vertical ? "horizontal" : "vertical"}
        aria-label={`Resize ${title.toLowerCase()}`}
        aria-valuenow={size}
        className={`${SASH[side]} ${dragging ? "bg-content/15" : "hover:bg-content/10"}`}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        onDoubleClick={() => {
          pending.current = defaultDockSize(side);
          commit();
        }}
      />
      {renderBody ? (
        renderBody(controls)
      ) : (
        <>
          <div className="flex h-9 min-w-0 shrink-0 items-center border-b border-stroke">
            <span className="min-w-0 flex-1 truncate pl-3 text-[13px] text-content/70">
              {title}
            </span>
            {controls}
          </div>
          <div className="relative min-h-0 min-w-0 flex-1">{children}</div>
        </>
      )}
      {menu ? (
        <ExplorerMenu
          x={menu.x}
          y={menu.y}
          ariaLabel={`Move ${title.toLowerCase()}`}
          items={SIDE_ITEMS.map((item) => ({
            kind: "item" as const,
            id: item.id,
            label: item.label,
            checked: item.id === side,
          }))}
          onPick={(id) => {
            if (isDockSide(id)) onSideChange(id);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </section>
  );
}
