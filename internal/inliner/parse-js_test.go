package inliner

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/tdewolff/parse/v2/js"
)

func TestTransformJavaScriptStyle(t *testing.T) {
	styleMap := StyleMap{"cn-x": "bg-red-500 px-2"}

	tests := []struct {
		name    string
		in      string
		style   StyleMap
		opts    Options
		want    string
		wantErr bool
	}{
		{
			name:  "double-quoted literal",
			in:    `const c = "cn-x flex";`,
			style: styleMap,
			want:  `const c = "bg-red-500 px-2 flex";`,
		},
		{
			name:  "two markers",
			in:    `const c = "cn-x cn-y flex";`,
			style: StyleMap{"cn-x": "p-2", "cn-y": "m-2"},
			want:  `const c = "p-2 m-2 flex";`,
		},
		{
			name:  "unknown marker",
			in:    `const c = "cn-missing flex";`,
			style: styleMap,
			want:  `const c = "flex";`,
		},
		{
			name:  "escaped quote",
			in:    `const c = "a \"b\" cn-x";`,
			style: styleMap,
			want:  `const c = "bg-red-500 px-2 a \"b\"";`,
		},
		{
			name:  "no-substitution template",
			in:    "const c = `cn-x flex`;",
			style: styleMap,
			want:  "const c = `bg-red-500 px-2 flex`;",
		},
		{
			name:  "template expression is untouched",
			in:    "const c = `cn-x ${value}`;",
			style: styleMap,
			want:  "const c = `cn-x ${value}`;",
		},
		{
			name: "nested template round trip",
			in:   "const c = `a ${`b ${value}`} d`;",
			want: "const c = `a ${`b ${value}`} d`;",
		},
		{
			name:  "comments are cleaned",
			in:    "// cn-x look\n/* cn-x look */\nconst c = \"cn-x\";",
			style: styleMap,
			want:  "// look\n/* look */\nconst c = \"bg-red-500 px-2\";",
		},
		{
			name: "division is untouched",
			in:   "const a = x / y / z;\nconst b = x/2;",
			want: "const a = x / y / z;\nconst b = x/2;",
		},
		{
			name:  "regular expressions are untouched",
			in:    `const a = /"cn-x"/; call(/cn-x/); const b = [/cn-x/, /cn-x/]; function f() { return /cn-x/; }`,
			style: styleMap,
			want:  `const a = /"cn-x"/; call(/cn-x/); const b = [/cn-x/, /cn-x/]; function f() { return /cn-x/; }`,
		},
		{
			name:  "command regular expression",
			in:    `const re = /[\\\/_+.#"@\[\(\{&]/; const c = "cn-x flex";`,
			style: styleMap,
			want:  `const re = /[\\\/_+.#"@\[\(\{&]/; const c = "bg-red-500 px-2 flex";`,
		},
		{
			name: "division after close parenthesis",
			in:   "const c = (a) / 2;",
			want: "const c = (a) / 2;",
		},
		{
			name: "division after close bracket",
			in:   "const c = values[0] / 2;",
			want: "const c = values[0] / 2;",
		},
		{
			name: "division after literals",
			in:   "const a = 10 / 2; const b = \"x\" / 2; const c = `x` / 2; const d = true / 2; const e = null / 2;",
			want: "const a = 10 / 2; const b = \"x\" / 2; const c = `x` / 2; const d = true / 2; const e = null / 2;",
		},
		{
			name: "regular expression flags and character classes",
			in:   `const a = /[a-z/\\\"]+/giu; const b = /(?:cn-x|x\/y)/g;`,
			want: `const a = /[a-z/\\\"]+/giu; const b = /(?:cn-x|x\/y)/g;`,
		},
		{
			name: "comments do not change regular expression context",
			in:   "const a = /* before */ /cn-x/;\nconst b = value /* before division */ / 2;",
			want: "const a = /* before */ /cn-x/;\nconst b = value /* before division */ / 2;",
		},
		{
			name:  "CRLF and unicode",
			in:    "// Grüße cn-x\r\nconst c = \"cn-x Größe\";\r\n",
			style: styleMap,
			want:  "// Grüße\r\nconst c = \"bg-red-500 px-2 Größe\";\r\n",
		},
		{
			name: "single-quoted non-marker is preserved",
			in:   `const c = 'after:content-[\'\']';`,
			want: `const c = 'after:content-[\'\']';`,
		},
		{
			name:  "escaped template delimiters",
			in:    "const c = `cn-x \\`literal\\` \\${value}`;",
			style: styleMap,
			want:  "const c = `bg-red-500 px-2 \\`literal\\` \\${value}`;",
		},
		{
			name:    "single-quoted marker",
			in:      `const c = 'cn-x flex';`,
			style:   styleMap,
			wantErr: true,
		},
		{
			name:    "unterminated string",
			in:      `const c = "cn-x;`,
			style:   styleMap,
			wantErr: true,
		},
		{
			name:  "utility with single quotes",
			in:    `const c = "cn-x flex";`,
			style: StyleMap{"cn-x": `after:content-['']`},
			want:  `const c = "after:content-[''] flex";`,
		},
		{
			name: "font heading defaults off",
			in:   `const c = "cn-font-heading text-lg";`,
			want: `const c = "text-lg";`,
		},
		{
			name: "font heading enabled",
			in:   `const c = "cn-font-heading text-lg";`,
			opts: Options{FontHeading: true},
			want: `const c = "font-heading text-lg";`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := TransformJavaScriptStyle(tt.in, tt.style, tt.opts)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("TransformJavaScriptStyle() error = nil, want error; output = %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("TransformJavaScriptStyle: %v", err)
			}
			if got != tt.want {
				t.Errorf("TransformJavaScriptStyle() = %q, want %q", got, tt.want)
			}
			_, err = parseJavaScriptSourceFile(got)
			if err != nil {
				t.Errorf("transformed output does not re-lex: %v", err)
			}
		})
	}
}

func TestJavaScriptRegExpContextMatrix(t *testing.T) {
	allowed := []struct {
		name  string
		token js.TokenType
	}{
		{name: "operator", token: js.EqToken},
		{name: "open brace", token: js.OpenBraceToken},
		{name: "open parenthesis", token: js.OpenParenToken},
		{name: "open bracket", token: js.OpenBracketToken},
		{name: "comma", token: js.CommaToken},
		{name: "colon", token: js.ColonToken},
		{name: "question", token: js.QuestionToken},
		{name: "semicolon", token: js.SemicolonToken},
		{name: "return", token: js.ReturnToken},
		{name: "typeof", token: js.TypeofToken},
		{name: "instanceof", token: js.InstanceofToken},
		{name: "in", token: js.InToken},
		{name: "of", token: js.OfToken},
		{name: "new", token: js.NewToken},
		{name: "delete", token: js.DeleteToken},
		{name: "void", token: js.VoidToken},
		{name: "throw", token: js.ThrowToken},
		{name: "case", token: js.CaseToken},
		{name: "do", token: js.DoToken},
		{name: "else", token: js.ElseToken},
		{name: "yield", token: js.YieldToken},
		{name: "await", token: js.AwaitToken},
	}
	for _, tt := range allowed {
		t.Run("allowed after "+tt.name, func(t *testing.T) {
			if !regExpAllowed(tt.token, true) {
				t.Errorf("regExpAllowed(%s) = false, want true", tt.token)
			}
		})
	}

	disallowed := []struct {
		name  string
		token js.TokenType
	}{
		{name: "identifier", token: js.IdentifierToken},
		{name: "number", token: js.IntegerToken},
		{name: "string", token: js.StringToken},
		{name: "template", token: js.TemplateToken},
		{name: "regexp", token: js.RegExpToken},
		{name: "close parenthesis", token: js.CloseParenToken},
		{name: "close bracket", token: js.CloseBracketToken},
		{name: "true", token: js.TrueToken},
		{name: "false", token: js.FalseToken},
		{name: "null", token: js.NullToken},
		{name: "this", token: js.ThisToken},
		{name: "postfix increment", token: js.IncrToken},
		{name: "postfix decrement", token: js.DecrToken},
	}
	for _, tt := range disallowed {
		t.Run("disallowed after "+tt.name, func(t *testing.T) {
			if regExpAllowed(tt.token, true) {
				t.Errorf("regExpAllowed(%s) = true, want false", tt.token)
			}
		})
	}
	if !regExpAllowed(0, false) {
		t.Error("a regular expression must be allowed at the start of a file")
	}
}

func TestTransformJavaScriptStyleRegularExpressionContexts(t *testing.T) {
	tests := []string{
		`const value = /"cn-x"/giu;`,
		`function value() { return /"cn-x"/; }`,
		`const values = [1, /"cn-x"/, /"cn-x"/];`,
		`const value = condition ? /"cn-x"/ : /"cn-x"/;`,
		`const value = () => /"cn-x"/;`,
		`if (/"cn-x"/.test(value)) value = /"cn-x"/;`,
		`value ||= /"cn-x"/; value &&= /"cn-x"/; value ??= /"cn-x"/;`,
		`throw /"cn-x"/;`,
		`const value = typeof /"cn-x"/;`,
		`for (const value of /"cn-x"/) break;`,
		`const value = source /* context */ / divisor;`,
		`source /= divisor;`,
		`source++ / divisor; source-- / divisor;`,
	}
	for _, source := range tests {
		t.Run(source, func(t *testing.T) {
			got, err := TransformJavaScriptStyle(source, StyleMap{"cn-x": "hidden"}, Options{})
			if err != nil {
				t.Fatalf("TransformJavaScriptStyle: %v", err)
			}
			if got != source {
				t.Errorf("regular expression or division changed:\ninput:  %q\noutput: %q", source, got)
			}
		})
	}
}

func TestTransformJavaScriptStyleRegistryCorpus(t *testing.T) {
	paths, err := filepath.Glob("../../components/*/*.js")
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range paths {
		source, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		got, err := TransformJavaScriptStyle(string(source), StyleMap{}, Options{})
		if err != nil {
			t.Errorf("transform %s: %v", path, err)
			continue
		}
		if !strings.Contains(string(source), "cn-") && got != string(source) {
			t.Errorf("%s changed without a cn- occurrence", path)
		}
	}
	if len(paths) != 47 {
		t.Errorf("component JavaScript file count = %d, want 47", len(paths))
	}
}

func TestTransformJavaScriptStyleChartNovaGolden(t *testing.T) {
	styleMap := loadNovaStyleMap(t)
	source, err := os.ReadFile("../../components/chart/chart.js")
	if err != nil {
		t.Fatal(err)
	}
	input := string(source)
	want := strings.Replace(
		input,
		`"cn-chart-tooltip grid min-w-32 items-start"`,
		`"`+styleMap["cn-chart-tooltip"]+` grid min-w-32 items-start"`,
		1,
	)
	got, err := TransformJavaScriptStyle(input, styleMap, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Error("chart JavaScript differs outside the expected tooltip literal")
	}
}

func TestStyleMapsAreSafeForJavaScriptLiterals(t *testing.T) {
	paths, err := filepath.Glob("../../assets/css/styles/style-*.css")
	if err != nil {
		t.Fatal(err)
	}
	if len(paths) != 8 {
		t.Fatalf("style map count = %d, want 8", len(paths))
	}
	for _, path := range paths {
		source, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		styleMap, err := CreateStyleMap(string(source))
		if err != nil {
			t.Fatalf("parse %s: %v", path, err)
		}
		for marker, classes := range styleMap {
			if strings.ContainsAny(classes, "\\\"`") || strings.Contains(classes, "${") {
				t.Errorf("%s %s contains JavaScript literal delimiters that require escaping: %q", path, marker, classes)
			}
		}
	}
}

func FuzzTransformJavaScriptStylePreservesMarkerFreeSource(f *testing.F) {
	seeds := []string{
		`const c = "flex items-center";`,
		`const re = /[\\\/_+.#"@\[\(\{&]/g;`,
		"const c = `a ${`b ${value}`} d`;",
		"// comment\r\nconst n = (a / b) / c;",
	}
	for _, seed := range seeds {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, source string) {
		if strings.Contains(source, "cn-") {
			t.Skip()
		}
		got, err := TransformJavaScriptStyle(source, StyleMap{}, Options{})
		if err != nil {
			return
		}
		if got != source {
			t.Fatalf("marker-free source changed:\ninput:  %q\noutput: %q", source, got)
		}
	})
}
