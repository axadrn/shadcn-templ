package command

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestDialogForwardsOpenStateToDialogRoot(t *testing.T) {
	open := false
	var out bytes.Buffer
	if err := Dialog(DialogProps{ID: "palette", Open: &open, DefaultOpen: true}).Render(context.Background(), &out); err != nil {
		t.Fatal(err)
	}
	html := out.String()
	if !strings.Contains(html, `data-templ-open="false"`) {
		t.Fatal("controlled command dialog is missing the dialog controlled marker")
	}
	if strings.Contains(html, `data-templ-default-open`) {
		t.Fatal("controlled false must override defaultOpen true")
	}
}
