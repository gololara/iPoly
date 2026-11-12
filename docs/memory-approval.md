# Memory contribution approval

Read a memory with `ipoly_memoria` and use its note version and contribution version when calling `ipoly_proponer_aportacion`. The proposal records the text, context, actor roles, and any selected attachments. Show the user the complete returned `content` before asking for approval.

After explicit approval, pass the exact `content` as `approvedContent`, its `contentHash`, proposal ID and version, and `confirmed: true` to `ipoly_aplicar_aportacion`. The server verifies the account, source versions, selected teacher profile and attachment ownership. A successful exact retry returns the same result. Read `ipoly_memoria` afterward to confirm the entry was added once.

The original capture stays in the memory. Teacher contributions preserve who explained the material and who recorded it. The application displays saved historical clarifications and their recorded authorship alongside new contributions.
