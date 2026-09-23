package server

import "testing"

func TestHubClosesSlowClientAndKeepsFastClient(t *testing.T) {
	h := NewHub()
	slow := h.Register()
	fast := h.Register()
	for i := 0; i < 256; i++ {
		slow <- []byte("full")
	}
	h.Broadcast([]byte("event"))
	for i := 0; i < 256; i++ {
		<-slow
	}
	if _, ok := <-slow; ok {
		t.Fatal("slow client channel remained open")
	}
	if got := <-fast; string(got) != "event" {
		t.Fatalf("fast client got %q", got)
	}
}
