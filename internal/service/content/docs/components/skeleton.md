---
title: Skeleton
description: Use to show a placeholder while content is loading.
---

<ComponentPreview name="skeleton-demo" />

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
shadcn-templ add skeleton
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource name="skeleton" title="components/skeleton/skeleton.templ" />

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```go showLineNumbers
import "github.com/axadrn/shadcn-templ/v2/components/skeleton"
```

```templ showLineNumbers
@skeleton.Skeleton(skeleton.Props{Class: "h-[20px] w-[100px] rounded-full"})
```

## Avatar

<ComponentPreview name="skeleton-avatar" />

## Card

<ComponentPreview name="skeleton-card" previewClassName="h-80" />

## Text

<ComponentPreview name="skeleton-text" />

## Form

<ComponentPreview name="skeleton-form" />

## Table

<ComponentPreview name="skeleton-table" />

## RTL

To enable RTL support, see the [Direction](/docs/components/direction) component.

<ComponentPreview styleName="base-nova" name="skeleton-rtl" direction="rtl" />

## API Reference

### Skeleton

The `Skeleton` component renders an animated placeholder block.

| Prop    | Type     | Default |
| ------- | -------- | ------- |
| `Class` | `string` | -       |
