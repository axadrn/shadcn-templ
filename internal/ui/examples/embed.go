package examples

import (
	"embed"
)

//go:embed */*.templ
var TemplFiles embed.FS
