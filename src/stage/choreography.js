// Animation choreography: a pure, time-driven state machine with no side
// effects. It can be unit-tested in node without a DOM, and SpineStage only
// translates its output into `state.setAnimation` calls.
//
// Stance lines matter (measured from the skeleton, see docs/design):
//   - loop_2 (idle) and cut_B (perform) are the same standing-with-sword pose.
//     Transitions between them are seamless.
//   - loop (ambient) is a different, turned-away pose. Entering/leaving it is
//     jarring, so it is opt-in and blends slowly.

export const STATES = {
  idle: 'idle',
  perform: 'perform',
  ambient: 'ambient',
}

// Events: 'loaded' | 'finished' | 'click' | 'autoPerform' | 'idleLong' | 'wake'
export function next(state, event, { ambientEnabled = false } = {}) {
  switch (state) {
    case STATES.idle:
      if (event === 'click' || event === 'autoPerform') {
        return { state: STATES.perform, loop: false }
      }
      if (event === 'idleLong' && ambientEnabled) {
        return { state: STATES.ambient, loop: false }
      }
      return { state: STATES.idle, loop: true }

    case STATES.perform:
      if (event === 'finished') return { state: STATES.idle, loop: true }
      if (event === 'click') return { state: STATES.perform, loop: false }
      return { state: STATES.perform, loop: false }

    case STATES.ambient:
      // Anything user-initiated wakes from the ambient pose.
      if (
        event === 'finished' ||
        event === 'click' ||
        event === 'wake' ||
        event === 'autoPerform'
      ) {
        return { state: STATES.idle, loop: true }
      }
      return { state: STATES.ambient, loop: false }

    default:
      // Boot state and any unknown state fall into idle.
      return { state: STATES.idle, loop: true }
  }
}
