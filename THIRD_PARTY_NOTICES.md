# Third-party notices

Ermes uses open-source dependencies that remain under their respective licenses.
The project license does not replace dependency licenses. Exact package versions
are recorded in `package-lock.json`; retain package license files when distributing
bundled code or container images.

## UI components

The UI primitives in `packages/ui/src/components/ui` are adapted from shadcn/ui
(https://github.com/shadcn-ui/ui), used under the MIT License:

```text
MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Dependencies and fonts

The application uses React, Next.js, TanStack Query, Radix UI, Tiptap, React Flow,
Recharts, Lucide, Tailwind CSS, Drizzle ORM, PostgreSQL, pg-boss and other packages.
Refer to each installed package's license and notices for its terms.

Geist and Geist Mono are distributed through Fontsource and retain their SIL Open
Font License. Font packages include the corresponding license files.

Optional image-processing packages include sharp/libvips components with Apache,
MIT and LGPL notices. Preserve those notices and the relevant source/relinking
information when redistributing image-processing binaries. The public source
repository does not vendor dependency binaries.
