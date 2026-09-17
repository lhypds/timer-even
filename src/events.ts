import { EventSourceType, OsEventTypeList, type EvenHubEvent } from "@evenrealities/even_hub_sdk";

/** The one type an Even Hub event carries, whichever kind of event it is. */
export function eventTypeOf(event: EvenHubEvent): OsEventTypeList | undefined {
  return event.sysEvent?.eventType ?? event.textEvent?.eventType ?? event.listEvent?.eventType;
}

/**
 * A single tap on the touch bar. `CLICK_EVENT` is 0, and the host's protobuf
 * drops a zero, so a tap usually arrives with no type at all: a system event
 * that still names its source, or a container event with nothing else in it
 * (lo-even and sc-even read taps the same way). A tap is also the first press
 * of the double tap that exits, so what acts on it must be safe to do twice.
 */
export function isTap(event: EvenHubEvent): boolean {
  const type = eventTypeOf(event);
  if (type === OsEventTypeList.CLICK_EVENT) return true;
  if (type != null) return false;
  const source = event.sysEvent?.eventSource;
  if (source != null && source !== EventSourceType.TOUCH_EVENT_FORM_DUMMY_NULL) return true;
  return event.textEvent?.containerID != null;
}

/**
 * Which way a step of scrolling on the touch bar went: up (the host's scroll
 * to the top) is 1, down is -1, and anything that is not a scroll is 0.
 */
export function scrollOf(event: EvenHubEvent): 1 | -1 | 0 {
  const type = eventTypeOf(event);
  if (type === OsEventTypeList.SCROLL_TOP_EVENT) return 1;
  if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) return -1;
  return 0;
}
