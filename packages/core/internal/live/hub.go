package live

import (
	"context"
	"time"
)

type Hub struct {
	listeners   map[int]func(string)
	nextID      int
	timer       *time.Timer
	Fingerprint string
	Sync        func(ctx context.Context) bool
}

func NewHub() *Hub {
	return &Hub{listeners: map[int]func(string){}}
}

func (h *Hub) Publish(topic string) {
	for _, fn := range h.listeners {
		fn(topic)
	}
}

func (h *Hub) Subscribe(fn func(string)) func() {
	h.nextID++
	id := h.nextID
	h.listeners[id] = fn
	if h.timer == nil {
		h.timer = time.AfterFunc(3*time.Second, h.tick)
	}
	return func() {
		delete(h.listeners, id)
		if len(h.listeners) == 0 && h.timer != nil {
			h.timer.Stop()
			h.timer = nil
		}
	}
}

func (h *Hub) tick() {
	if h.Sync != nil && len(h.listeners) > 0 && h.Sync(context.Background()) {
		h.Publish("machines")
	}
	if len(h.listeners) > 0 {
		h.timer = time.AfterFunc(3*time.Second, h.tick)
	}
}
