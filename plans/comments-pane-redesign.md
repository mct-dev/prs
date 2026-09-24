# Comments pane redesign

Living design doc. Each style below is fully specced so we can compare like-for-like. Add new styles, fork existing ones, kill ones that don't earn their keep. Currently no style is canonical — this is exploration.

## Common rules (apply to every style below)

- **No `·` separator dots between metadata fields.** Color hierarchy + whitespace do that work.
- **Author on its own line.** Never inline with the body.
- **Per-author color identity.** Each author's name renders in a stable hash-color so speaker changes are legible without glyphs.
- **Slack-style author collapse for consecutive same-author messages within a window** (~5 min). The second message drops the author/time header and just adds a body row under the previous one.
- **File-grouped.** Adjacent comments on the same file share one `filename` header; line numbers prefix each thread.
- **One column of horizontal padding** on the left and right of the pane (not flush with the edges).
- **Selection (cursor) is one strong visual element.** What that element is varies per style — a left bar, an underline, a color invert, etc. Whatever it is, it's only on the focused comment.

## Sample data used in every mockup

A single file, three top-level comments, one of which has six replies from mixed authors with one consecutive same-author run:

```
session.ts:127  kit · 7h:  test comment
session.ts:129  kit · 7h:  another
                  alice · 7h:  replied
                  kit · 5h:    lol
                  bob · 5h:    nice
                  kit · 5h:    hi
                  kit · 5h:    top         ← collapses (consecutive)
                  alice · 5h:  testing
session.ts:???  kit · 7h:  hello
```

---

## Style A — stacked chat

**Principle.** Slack/Discord rhythm. Author + time on one line, body indented under. Replies recurse with the same shape, indented one level. Selection = left bar.

**Unfocused, full thread:**

```text
 session.ts                                                       
   kitlangton    7h                                         :127  
     test comment                                                 
                                                                  
   kitlangton    7h                                         :129  
     another                                                      
       alice    7h                                                
         replied                                                  
       kitlangton    5h                                           
         lol                                                      
       bob    5h                                                  
         nice                                                     
       kitlangton    5h                                           
         hi                                                       
         top                          ← collapsed (consecutive)   
       alice    5h                                                
         testing                                                  
                                                                  
   kitlangton    7h                                         :???  
     hello                                                        
```

**Focused on a top-level thread (`another`):**

```text
   kitlangton    7h                                         :127  
     test comment                                                 
                                                                  
 ▌ kitlangton    7h                                         :129  
 ▌   another                                                      
 ▌     alice    7h                                                
 ▌       replied                                                  
 ▌     kitlangton    5h                                           
 ▌       lol                                                      
 ▌     bob    5h                                                  
 ▌       nice                                                     
 ▌     kitlangton    5h                                           
 ▌       hi                                                       
 ▌       top                                                      
 ▌     alice    5h                                                
 ▌       testing                                                  
                                                                  
   kitlangton    7h                                         :???  
     hello                                                        
```

**Focused on a single reply (`bob nice`):**

```text
   kitlangton    7h                                         :129  
     another                                                      
       alice    7h                                                
         replied                                                  
       kitlangton    5h                                           
         lol                                                      
 ▌     bob    5h                                                  
 ▌       nice                                                     
       kitlangton    5h                                           
         hi                                                       
```

**Long body wrap.** Body wraps at the body indent column; author/time stay on their own header line above.

**Tradeoffs.**
- Quietest style. Resting state has zero glyphs.
- Vertical-heavy: every comment costs at least 2 lines (author, body).
- Reply nesting visible only by indent — could feel ambiguous in deep threads, but PR threads rarely go deep.

---

## Style B — newspaper

**Principle.** Author and time stacked as a tiny header, blank line between every comment. Reads like a wire of dispatches. Selection = left bar.

**Unfocused, full thread:**

```text
 session.ts                                                       
                                                                  
   kitlangton                                                :127  
   7h                                                              
   test comment                                                    
                                                                  
   kitlangton                                                :129  
   7h                                                              
   another                                                         
                                                                  
     alice                                                         
     7h                                                            
     replied                                                       
                                                                  
     kitlangton                                                    
     5h                                                            
     lol                                                           
                                                                  
     bob                                                           
     5h                                                            
     nice                                                          
                                                                  
     kitlangton                                                    
     5h                                                            
     hi                                                            
     top                              ← collapsed (consecutive)    
                                                                  
     alice                                                         
     5h                                                            
     testing                                                       
                                                                  
   kitlangton                                                :???  
   7h                                                              
   hello                                                           
```

**Focused (`another`):**

```text
   kitlangton                                                :127  
   7h                                                              
   test comment                                                    
                                                                  
 ▌ kitlangton                                                :129  
 ▌ 7h                                                              
 ▌ another                                                         
 ▌                                                                 
 ▌   alice                                                         
 ▌   7h                                                            
 ▌   replied                                                       
 ▌                                                                 
 ▌   kitlangton                                                    
 ▌   5h                                                            
 ▌   lol                                                           
 ▌   ...                                                           
```

**Long body wrap.** Wraps at body column; no special handling needed.

**Tradeoffs.**
- Most vertical. Three lines minimum per comment.
- Most "spacious" feel. Excellent for slow reading.
- Bad for threads with many short replies — feels like a column of haiku.

---

## Style C — Charm prefix (per-line bar = focus)

**Principle.** Borrowed from `crush`'s message rendering. Each author has a stable color; author/time on their own line, body on a separate line below. The currently focused comment gets a `▌` left prefix the full height of the comment. Nothing else has chrome.

**Unfocused, full thread:**

```text
 session.ts                                                       
                                                                  
   kitlangton                                                :127  
   7h                                                              
   test comment                                                    
                                                                  
   kitlangton                                                :129  
   7h                                                              
   another                                                         
                                                                  
     alice                                                         
     7h                                                            
     replied                                                       
                                                                  
     kitlangton                                                    
     5h                                                            
     lol                                                           
                                                                  
     bob                                                           
     5h                                                            
     nice                                                          
                                                                  
     kitlangton                                                    
     5h                                                            
     hi                                                            
     top                              ← collapsed (consecutive)    
                                                                  
     alice                                                         
     5h                                                            
     testing                                                       
                                                                  
   kitlangton                                                :???  
   7h                                                              
   hello                                                           
```

(Looks similar to Style B at rest — that's intentional.)

**Focused on `bob nice`:**

```text
     kitlangton                                                    
     5h                                                            
     lol                                                           
                                                                  
   ▌ bob                                                           
   ▌ 5h                                                            
   ▌ nice                                                          
                                                                  
     kitlangton                                                    
     5h                                                            
     hi                                                            
```

**Focused on a top-level thread.** Same `▌` runs the full vertical extent of the thread including replies.

**Tradeoffs.**
- Most aligned with Charm's own conventions; would feel familiar to anyone who's used `crush`.
- Resting state is silent; selection is unambiguous.
- Same vertical cost as Style B.

---

## Style D — tree

**Principle.** Vertical guide lines + branch elbows make the thread structure spatial. Author/time become branch labels. Selection = bold/inverted author label.

**Unfocused, full thread:**

```text
 session.ts                                                       
 │                                                                
 ├─ kitlangton                                                :127  
 │  7h                                                              
 │  test comment                                                    
 │                                                                
 ╰─ kitlangton                                                :129  
    7h                                                              
    another                                                         
    │                                                                
    ├─ alice                                                  7h    
    │  replied                                                      
    │                                                                
    ├─ kitlangton                                             5h    
    │  lol                                                          
    │                                                                
    ├─ bob                                                    5h    
    │  nice                                                         
    │                                                                
    ├─ kitlangton                                             5h    
    │  hi                                                           
    │  top                              ← collapsed                 
    │                                                                
    ╰─ alice                                                  5h    
       testing                                                      
                                                                  
 ╰─ kitlangton                                                :???  
    7h                                                              
    hello                                                           
```

**Focused on `bob nice`** — the author label inverts/bolds:

```text
    ├─ kitlangton                                             5h    
    │  lol                                                          
    │                                                                
    ├─ ▌bob▌                                                  5h    ← selected
    │  nice                                                         
    │                                                                
    ├─ kitlangton                                             5h    
    │  hi                                                           
```

**Tradeoffs.**
- Strongest spatial structure. Useful when threads branch (which today's PR threads in ghui rarely do).
- Box-drawing chars require terminal/font support; can render fragile in some emulators.
- More "visual chrome" than the other three. Intentional design statement, not a quiet utility.

---

## Notes on author color

ghui currently has one human author for most comments (you). Author-color hashing only earns its keep when reviewers show up. For the solo case, all three "kit" lines render in the same color, which is functionally identical to no color.

Suggested hashing: stable per-author hue selection from a 6-color palette (so colors stay in the theme), avoiding the file-header color and the focus-bar color.

## Open questions

1. **Selection indicator across styles.** Is `▌` always the right cursor? In Style D the cursor inverts the author label instead. Worth exploring whether ghui should pick *one* selection language pane-wide or let each pane choose.
2. **What does the focused row do?** Right now the cursor is just visual. Likely should also drive the keymap: `r` reply, `e` edit, `d` delete, `c` collapse/expand thread.
3. **Empty states.** What does "no comments yet" look like in each style? Probably the file header + a single dim "—" or "no comments" line.
4. **Long bodies (paragraphs / code fences / images).** Fenced code in a comment body should render with its own subtle indent, not the comment's indent — otherwise nested fences become hard to read.
5. **Thread truncation.** A thread with 30+ replies in any style overwhelms the pane. Need a "show first 3 + last 1, expand on focus" rule. That logic is style-independent.
6. **Selection bar height.** When focused on a top-level comment with many replies, does `▌` cover the *entire thread* (Style A/C as drawn above) or only the top-level row? Choose one and stick with it.

## Status

Active exploration. No style is canonical yet. Iterate freely; commits to this file are explicitly *not* product commitments.
