---
language: en
date: 2026-02-21
---
# Real time chat room

The main goal of this project is to create a real time chat room where people
can talk to each other either by a main group displayed window that show all the
people's messages in the current session or to allow each user to talk to each
other

## Tech stack used

1. TypeScript/JavaScript with Node.JS runtime
2. React
3. Postgresql
4. Web sockets 
5. Maybe I will be using open code or some kind of AI assistance.

### TODOs

- [ ] Writing tests

   I wanna write some tests that can allow for a fallback that can preserve the
   state and healthiness of the application

1. [ ] Changing the purpose of Redis from checking the authorization to managing
   the messages' cache only

   Redis doesn't do the message management yet, it only does the authorization
   part where it takes the client's authorization ID and checks if it is valid
   and used.

2. [ ] Getting back into React

   React does things like re-rendering but not a whole re-render of the
   component, but of the nodes in the virtual DOM that uses to compare it to the
   real DOM and check what nodes were actually change and re-render those.


